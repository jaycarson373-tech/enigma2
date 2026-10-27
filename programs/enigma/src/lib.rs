//! Enigma v1: independently implemented timed SOL pooling and Pump.fun launch.
//! No protocol fee, operator withdrawal, mutable offering terms or arbitrary CPI.
use borsh::{BorshDeserialize, BorshSerialize};
use pinocchio::{
    cpi::{invoke_signed_with_slice, Seed, Signer},
    error::ProgramError,
    instruction::{InstructionAccount, InstructionView},
    sysvars::{clock::Clock, rent::Rent, Sysvar},
    AccountView, Address, ProgramResult,
};
use pinocchio_system::instructions::{Allocate, Assign, Transfer};
mod ids;
mod math;
mod state;
use ids::*;
use math::{add, proportional, sold, sub};
use state::*;
#[cfg(not(feature = "no-entrypoint"))]
pinocchio::entrypoint!(process_instruction);
const VERSION: u8 = 1;
const CREATION_BUDGET: u64 = 20_000_000;
const OFFERING_SPACE: usize = 560;
const POSITION_SPACE: usize = 105;
const CONFIG_SPACE: usize = 136;
const INVALID: ProgramError = ProgramError::InvalidArgument;
fn require(ok: bool) -> ProgramResult {
    if ok {
        Ok(())
    } else {
        Err(INVALID)
    }
}
fn writable(a: &AccountView) -> ProgramResult {
    require(a.is_writable())
}
fn signer(a: &AccountView) -> ProgramResult {
    require(a.is_signer())
}
fn key(a: &AccountView, k: &Address) -> ProgramResult {
    require(a.address() == k)
}
fn pda(a: &AccountView, seeds: &[&[u8]], id: &Address) -> Result<u8, ProgramError> {
    let (expected, b) = Address::find_program_address(seeds, id);
    require(a.address() == &expected)?;
    Ok(b)
}
fn read<T: BorshDeserialize>(
    a: &AccountView,
    id: &Address,
    disc: &[u8; 8],
) -> Result<T, ProgramError> {
    require(a.owned_by(id))?;
    let d = a.try_borrow()?;
    require(d.len() >= 8 && d[..8] == disc[..])?;
    T::deserialize(&mut &d[8..]).map_err(|_| ProgramError::InvalidAccountData)
}
fn write<T: BorshSerialize>(a: &mut AccountView, disc: &[u8; 8], v: &T) -> ProgramResult {
    writable(a)?;
    let encoded = borsh::to_vec(v).map_err(|_| ProgramError::InvalidAccountData)?;
    let mut d = a.try_borrow_mut()?;
    require(d.len() >= encoded.len() + 8)?;
    d.fill(0);
    d[..8].copy_from_slice(disc);
    d[8..8 + encoded.len()].copy_from_slice(&encoded);
    Ok(())
}
fn system_wallet(a: &AccountView) -> ProgramResult {
    require(a.owned_by(&SYSTEM) && a.is_data_empty() && !a.executable())
}
fn fresh_pda(
    payer: &AccountView,
    a: &AccountView,
    id: &Address,
    seeds: &[Seed],
    space: usize,
) -> ProgramResult {
    writable(a)?;
    system_wallet(a)?;
    require(payer.address() != a.address())?;
    let rent = Rent::get()?.try_minimum_balance(space)?;
    if a.lamports() < rent {
        Transfer {
            from: payer,
            to: a,
            lamports: sub(rent, a.lamports())?,
        }
        .invoke()?;
    }
    let s = Signer::from(seeds);
    Allocate {
        account: a,
        space: space as u64,
    }
    .invoke_signed(&[s])?;
    Assign {
        account: a,
        owner: id,
    }
    .invoke_signed(&[Signer::from(seeds)])
}
fn config(a: &AccountView, id: &Address) -> Result<Config, ProgramError> {
    let b = pda(a, &[b"config"], id)?;
    let c: Config = read(a, id, &DISC_CONFIG)?;
    require(c.version == VERSION && c.bump == b)?;
    Ok(c)
}
fn offering(a: &AccountView, id: &Address) -> Result<Offering, ProgramError> {
    let o: Offering = read(a, id, &DISC_OFFERING)?;
    let b = pda(a, &[b"offering", &o.id.to_le_bytes()], id)?;
    require(
        o.version == VERSION
            && o.bump == b
            && o.is_native
            && o.quote_mint == SOL.to_bytes()
            && o.quote_token_program == TOKEN.to_bytes(),
    )?;
    Ok(o)
}
fn vault(a: &AccountView, o: &AccountView, b: u8, id: &Address) -> ProgramResult {
    require(pda(a, &[b"vault", o.address().as_ref()], id)? == b)?;
    system_wallet(a)?;
    writable(a)
}
fn amount_at(a: &AccountView, offset: usize) -> Result<u64, ProgramError> {
    let d = a.try_borrow()?;
    let slice = d
        .get(offset..offset + 8)
        .ok_or(ProgramError::InvalidAccountData)?;
    Ok(u64::from_le_bytes(
        slice
            .try_into()
            .map_err(|_| ProgramError::InvalidAccountData)?,
    ))
}
fn reserves(g: &AccountView) -> Result<(u64, u64, u64, u64), ProgramError> {
    key(g, &PUMP_GLOBAL)?;
    require(g.owned_by(&PUMP))?;
    {
        let d = g.try_borrow()?;
        require(d.len() >= 162 && d[..8] == DISC_GLOBAL)?;
    }
    let r = (
        amount_at(g, 73)?,
        amount_at(g, 81)?,
        amount_at(g, 89)?,
        amount_at(g, 97)?,
    );
    require(r.0 > r.2 && r.1 > 0 && r.2 > 0 && r.3 >= r.2)?;
    Ok(r)
}
fn ata(a: &AccountView, mint: &Address, owner: &Address, token: &Address) -> ProgramResult {
    pda(a, &[owner.as_ref(), token.as_ref(), mint.as_ref()], &ATA)?;
    Ok(())
}
fn token_balance(a: &AccountView, mint: &Address, owner: &Address) -> Result<u64, ProgramError> {
    require(a.owned_by(&TOKEN_2022))?;
    {
        let d = a.try_borrow()?;
        require(
            d.len() >= 165
                && d[..32] == mint.as_ref()[..]
                && d[32..64] == owner.as_ref()[..]
                && d[108] == 1,
        )?;
    }
    amount_at(a, 64)
}
// CPI metadata is constructed locally. No caller-supplied program or signer is trusted.
fn cpi(
    program: &Address,
    accounts: &[(&AccountView, bool, bool)],
    data: &[u8],
    seeds: &[Signer],
) -> ProgramResult {
    let meta: Vec<_> = accounts
        .iter()
        .map(|(a, w, s)| InstructionAccount::new(a.address(), *w, *s))
        .collect();
    let refs: Vec<_> = accounts.iter().map(|(a, _, _)| *a).collect();
    invoke_signed_with_slice(
        &InstructionView {
            program_id: program,
            accounts: &meta,
            data,
        },
        &refs,
        seeds,
    )
}
fn create_ata(
    a: &[AccountView],
    payer: usize,
    target: usize,
    owner: usize,
    mint: usize,
    sys: usize,
    tok: usize,
) -> ProgramResult {
    cpi(
        &ATA,
        &[
            (&a[payer], true, true),
            (&a[target], true, false),
            (&a[owner], false, false),
            (&a[mint], false, false),
            (&a[sys], false, false),
            (&a[tok], false, false),
        ],
        &[1],
        &[],
    )
}
pub fn process_instruction(id: &Address, a: &mut [AccountView], data: &[u8]) -> ProgramResult {
    require(data.len() >= 8)?;
    let (disc, args) = data.split_at(8);
    if disc == IX_INITIALIZE {
        initialize(id, a, args)
    } else if disc == IX_PAUSE {
        pause(id, a, args)
    } else if disc == IX_FILE {
        file(id, a, args)
    } else if disc == IX_COMMIT {
        commit(id, a, args)
    } else if disc == IX_LAUNCH {
        require(args.is_empty())?;
        launch(id, a)
    } else if disc == IX_CLAIM {
        require(args.is_empty())?;
        claim(id, a)
    } else {
        Err(ProgramError::InvalidInstructionData)
    }
}
fn initialize(id: &Address, a: &mut [AccountView], args: &[u8]) -> ProgramResult {
    require(a.len() == 5 && args.is_empty())?;
    signer(&a[0])?;
    writable(&a[0])?;
    system_wallet(&a[0])?;
    key(&a[2], &SYSTEM)?;
    key(&a[3], id)?;
    require(a[3].executable() && a[3].owned_by(&LOADER))?;
    require(a[4].owned_by(&LOADER))?;
    pda(&a[4], &[id.as_ref()], &LOADER)?;
    // Loader state enums: Program=2, ProgramData=3, Some(authority)=1.
    {
        let p = a[3].try_borrow()?;
        let d = a[4].try_borrow()?;
        require(
            p.len() == 36
                && p[..4] == 2u32.to_le_bytes()
                && p[4..36] == a[4].address().as_ref()[..],
        )?;
        require(
            d.len() >= 45
                && d[..4] == 3u32.to_le_bytes()
                && d[12] == 1
                && d[13..45] == a[0].address().as_ref()[..],
        )?;
    }
    let bump = pda(&a[1], &[b"config"], id)?;
    let bs = [bump];
    let seeds = [Seed::from(b"config"), Seed::from(bs.as_slice())];
    fresh_pda(&a[0], &a[1], id, &seeds, CONFIG_SPACE)?;
    let c = Config {
        operator: a[0].address().to_bytes(),
        filing_paused: false,
        next_id: 0,
        bump,
        min_duration: 60,
        max_duration: 3600,
        min_cap_bps: 10,
        max_cap_bps: 1000,
        treasury: a[0].address().to_bytes(),
        version: VERSION,
    };
    write(&mut a[1], &DISC_CONFIG, &c)
}
fn pause(id: &Address, a: &mut [AccountView], args: &[u8]) -> ProgramResult {
    require(a.len() == 2 && args.len() == 1 && args[0] <= 1)?;
    signer(&a[0])?;
    let mut c = config(&a[1], id)?;
    require(a[0].address().as_ref() == c.operator)?;
    c.filing_paused = args[0] == 1;
    write(&mut a[1], &DISC_CONFIG, &c)
}
fn file(id: &Address, a: &mut [AccountView], args: &[u8]) -> ProgramResult {
    require(a.len() == 14)?;
    signer(&a[0])?;
    writable(&a[0])?;
    system_wallet(&a[0])?;
    key(&a[11], &SYSTEM)?;
    let mut c = config(&a[1], id)?;
    require(!c.filing_paused)?;
    key(&a[12], &Address::new_from_array(c.treasury))?;
    key(&a[13], id)?;
    let t = Terms::try_from_slice(args).map_err(|_| ProgramError::InvalidInstructionData)?;
    require(
        !t.name.trim().is_empty()
            && t.name.len() <= 32
            && !t.symbol.trim().is_empty()
            && t.symbol.len() <= 10
            && t.uri.len() <= 200
            && t.uri.starts_with("https://"),
    )?;
    require(
        (c.min_duration..=c.max_duration).contains(&t.duration)
            && t.duration % 60 == 0
            && (c.min_cap_bps..=c.max_cap_bps).contains(&t.cap_bps)
            && t.creator_fee_bps == 0
            && !t.holder_reward,
    )?;
    key(&a[4], &SOL)?;
    key(&a[9], &TOKEN)?;
    key(&a[10], &ATA)?;
    let (vt, vq, cs, ts) = reserves(&a[6])?;
    let number = c.next_id.to_le_bytes();
    let b = pda(&a[2], &[b"offering", &number], id)?;
    let vb = pda(&a[3], &[b"vault", a[2].address().as_ref()], id)?;
    system_wallet(&a[3])?;
    writable(&a[3])?;
    let now = Clock::get()?.unix_timestamp;
    let target = u64::try_from((vq as u128) * (cs as u128) / (vt - cs) as u128)
        .map_err(|_| ProgramError::ArithmeticOverflow)?;
    let o = Offering {
        id: c.next_id,
        creator: a[0].address().to_bytes(),
        quote_mint: SOL.to_bytes(),
        quote_token_program: TOKEN.to_bytes(),
        quote_decimals: 9,
        is_native: true,
        status: 1,
        creator_fee_bps: 0,
        holder_reward: false,
        fee_bps: 0,
        cap_bps: t.cap_bps,
        closes_at: now
            .checked_add(t.duration)
            .ok_or(ProgramError::ArithmeticOverflow)?,
        target,
        raised: 0,
        total_weight: 0,
        v_token: vt,
        v_pair: vq,
        curve_supply: cs,
        token_supply: ts,
        wallet_cap: u64::try_from((ts as u128) * (t.cap_bps as u128) / 10000)
            .map_err(|_| ProgramError::ArithmeticOverflow)?,
        deposit: CREATION_BUDGET,
        backers: 0,
        mint: [0; 32],
        received: 0,
        leftover: 0,
        pad_fee: 0,
        graduated: false,
        created_at: now,
        launched_at: 0,
        bump: b,
        vault_bump: vb,
        name: t.name,
        symbol: t.symbol,
        uri: t.uri,
        version: VERSION,
        creation_cost: 0,
    };
    let bs = [b];
    let seeds = [
        Seed::from(b"offering"),
        Seed::from(number.as_slice()),
        Seed::from(bs.as_slice()),
    ];
    fresh_pda(&a[0], &a[2], id, &seeds, OFFERING_SPACE)?;
    Transfer {
        from: &a[0],
        to: &a[3],
        lamports: add(CREATION_BUDGET, Rent::get()?.try_minimum_balance(0)?)?,
    }
    .invoke()?;
    c.next_id = add(c.next_id, 1)?;
    write(&mut a[1], &DISC_CONFIG, &c)?;
    write(&mut a[2], &DISC_OFFERING, &o)
}
fn commit(id: &Address, a: &mut [AccountView], args: &[u8]) -> ProgramResult {
    require(a.len() == 9 && args.len() == 8)?;
    signer(&a[0])?;
    writable(&a[0])?;
    system_wallet(&a[0])?;
    key(&a[8], &SYSTEM)?;
    key(&a[4], &SOL)?;
    key(&a[6], id)?;
    key(&a[7], &TOKEN)?;
    let amount = u64::from_le_bytes(args.try_into().map_err(|_| INVALID)?);
    require(amount > 0)?;
    let mut o = offering(&a[1], id)?;
    require(o.status == 1 && Clock::get()?.unix_timestamp < o.closes_at)?;
    vault(&a[3], &a[1], o.vault_bump, id)?;
    let b = pda(
        &a[2],
        &[
            b"position",
            a[1].address().as_ref(),
            a[0].address().as_ref(),
        ],
        id,
    )?;
    let existing = a[2].owned_by(id);
    let mut p = if existing {
        let p: Position = read(&a[2], id, &DISC_POSITION)?;
        require(
            p.version == VERSION
                && p.offering == a[1].address().to_bytes()
                && p.backer == a[0].address().to_bytes(),
        )?;
        p
    } else {
        Position {
            offering: a[1].address().to_bytes(),
            backer: a[0].address().to_bytes(),
            committed: 0,
            weight: 0,
            joined_at: Clock::get()?.unix_timestamp,
            version: VERSION,
        }
    };
    let raised = add(o.raised, amount)?;
    let total = sold(raised, o.v_token, o.v_pair)?;
    require(total < o.curve_supply)?;
    let weight = sub(total, u64::try_from(o.total_weight).map_err(|_| INVALID)?)?;
    require(weight > 0)?;
    p.weight = p
        .weight
        .checked_add(weight as u128)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    require(p.weight <= o.wallet_cap as u128)?;
    p.committed = add(p.committed, amount)?;
    if !existing {
        let bs = [b];
        let seeds = [
            Seed::from(b"position"),
            Seed::from(a[1].address().as_ref()),
            Seed::from(a[0].address().as_ref()),
            Seed::from(bs.as_slice()),
        ];
        fresh_pda(&a[0], &a[2], id, &seeds, POSITION_SPACE)?;
        o.backers = o
            .backers
            .checked_add(1)
            .ok_or(ProgramError::ArithmeticOverflow)?;
    }
    Transfer {
        from: &a[0],
        to: &a[3],
        lamports: amount,
    }
    .invoke()?;
    o.raised = raised;
    o.total_weight = total as u128;
    write(&mut a[1], &DISC_OFFERING, &o)?;
    write(&mut a[2], &DISC_POSITION, &p)
}
fn launch(id: &Address, a: &mut [AccountView]) -> ProgramResult {
    require(a.len() == 40)?;
    signer(&a[0])?;
    signer(&a[1])?;
    writable(&a[0])?;
    system_wallet(&a[0])?;
    system_wallet(&a[1])?;
    let mut o = offering(&a[2], id)?;
    require(o.status == 1 && o.raised > 0 && Clock::get()?.unix_timestamp >= o.closes_at)?;
    vault(&a[3], &a[2], o.vault_bump, id)?;
    let _c = config(&a[13], id)?;
    key(&a[7], &SOL)?;
    key(&a[8], &TOKEN)?;
    key(&a[9], &TOKEN_2022)?;
    key(&a[10], &ATA)?;
    key(&a[11], &SYSTEM)?;
    key(&a[12], &PUMP)?;
    key(&a[15], id)?;
    key(&a[19], &MAYHEM)?;
    key(&a[38], &PUMP_FEE)?;
    key(&a[39], &Address::new_from_array(o.creator))?;
    writable(&a[39])?;
    require(reserves(&a[18])? == (o.v_token, o.v_pair, o.curve_supply, o.token_supply))?;
    pda(&a[6], &[b"bonding-curve", a[1].address().as_ref()], &PUMP)?;
    ata(&a[5], a[1].address(), a[3].address(), &TOKEN_2022)?;
    ata(&a[17], a[1].address(), a[6].address(), &TOKEN_2022)?;
    // A fresh mint and curve prevent interposed buys; the following CPI pair is atomic.
    require(a[1].is_data_empty() && a[6].is_data_empty() && a[5].is_data_empty())?;
    let before = a[0].lamports();
    let vb = a[3].lamports();
    require(
        vb >= add(
            add(o.raised, o.deposit)?,
            Rent::get()?.try_minimum_balance(0)?,
        )?,
    )?;
    let mut data = vec![214, 144, 76, 236, 95, 139, 49, 180];
    for s in [&o.name, &o.symbol, &o.uri] {
        data.extend_from_slice(&(s.len() as u32).to_le_bytes());
        data.extend_from_slice(s.as_bytes());
    }
    data.extend_from_slice(&o.creator);
    data.extend_from_slice(&[0, 0]);
    data.extend_from_slice(&0u64.to_le_bytes());
    data.push(0);
    cpi(
        &PUMP,
        &[
            (&a[1], true, true),
            (&a[16], false, false),
            (&a[6], true, false),
            (&a[17], true, false),
            (&a[18], false, false),
            (&a[0], true, true),
            (&a[11], false, false),
            (&a[9], false, false),
            (&a[10], false, false),
            (&a[19], true, false),
            (&a[20], false, false),
            (&a[21], true, false),
            (&a[22], true, false),
            (&a[23], true, false),
            (&a[24], false, false),
            (&a[12], false, false),
        ],
        &data,
        &[],
    )?;
    create_ata(a, 0, 5, 3, 1, 11, 9)?;
    let bs = [o.vault_bump];
    let seeds = [
        Seed::from(b"vault"),
        Seed::from(a[2].address().as_ref()),
        Seed::from(bs.as_slice()),
    ];
    let mut buy = vec![225, 247, 80, 30, 213, 179, 132, 136];
    buy.extend_from_slice(&o.raised.to_le_bytes());
    let min = proportional(
        u64::try_from(o.total_weight).map_err(|_| INVALID)?,
        9500,
        10000,
    )?
    .max(1);
    buy.extend_from_slice(&min.to_le_bytes());
    buy.push(0);
    cpi(
        &PUMP,
        &[
            (&a[18], false, false),
            (&a[1], false, false),
            (&a[7], false, false),
            (&a[9], false, false),
            (&a[8], false, false),
            (&a[6], true, false),
            (&a[17], true, false),
            (&a[25], true, false),
            (&a[3], true, true),
            (&a[5], true, false),
            (&a[4], true, false),
            (&a[35], true, false),
            (&a[37], false, false),
            (&a[29], true, false),
            (&a[11], false, false),
            (&a[24], false, false),
            (&a[12], false, false),
        ],
        &buy,
        &[Signer::from(seeds.as_slice())],
    )?;
    let received = token_balance(&a[5], a[1].address(), a[3].address())?;
    require(received >= min && received as u128 <= o.total_weight)?;
    let debit = sub(vb, a[3].lamports())?;
    let payer_cost = sub(before, a[0].lamports())?;
    let extra = debit.saturating_sub(o.raised);
    let costs = add(extra, payer_cost)?;
    require(costs <= o.deposit)?;
    // Reimburse observed rent only, capped by the creator's explicit budget.
    if payer_cost > 0 {
        Transfer {
            from: &a[3],
            to: &a[0],
            lamports: payer_cost,
        }
        .invoke_signed(&[Signer::from(seeds.as_slice())])?;
    }
    let refund = sub(o.deposit, costs)?;
    if refund > 0 {
        Transfer {
            from: &a[3],
            to: &a[39],
            lamports: refund,
        }
        .invoke_signed(&[Signer::from(seeds.as_slice())])?;
    }
    o.status = 2;
    o.mint = a[1].address().to_bytes();
    o.received = received;
    o.leftover = o.raised.saturating_sub(debit);
    o.launched_at = Clock::get()?.unix_timestamp;
    o.creation_cost = costs;
    write(&mut a[2], &DISC_OFFERING, &o)
}
fn claim(id: &Address, a: &mut [AccountView]) -> ProgramResult {
    require(a.len() == 15)?;
    signer(&a[0])?;
    writable(&a[0])?;
    writable(&a[1])?;
    key(&a[8], &SOL)?;
    key(&a[10], id)?;
    key(&a[11], &TOKEN)?;
    key(&a[12], &TOKEN_2022)?;
    key(&a[13], &ATA)?;
    key(&a[14], &SYSTEM)?;
    let o = offering(&a[2], id)?;
    require(o.status == 2 && o.total_weight > 0)?;
    vault(&a[4], &a[2], o.vault_bump, id)?;
    key(&a[5], &Address::new_from_array(o.mint))?;
    pda(
        &a[3],
        &[
            b"position",
            a[2].address().as_ref(),
            a[1].address().as_ref(),
        ],
        id,
    )?;
    let p: Position = read(&a[3], id, &DISC_POSITION)?;
    require(
        p.version == VERSION
            && p.offering == a[2].address().to_bytes()
            && p.backer == a[1].address().to_bytes()
            && p.weight > 0
            && p.weight <= o.wallet_cap as u128,
    )?;
    ata(&a[6], a[5].address(), a[4].address(), &TOKEN_2022)?;
    ata(&a[7], a[5].address(), a[1].address(), &TOKEN_2022)?;
    let tokens = proportional(o.received, p.weight, o.total_weight)?;
    let change = proportional(o.leftover, p.weight, o.total_weight)?;
    require(
        token_balance(&a[6], a[5].address(), a[4].address())? >= tokens && tokens <= o.wallet_cap,
    )?;
    create_ata(a, 0, 7, 1, 5, 14, 12)?;
    let bs = [o.vault_bump];
    let seeds = [
        Seed::from(b"vault"),
        Seed::from(a[2].address().as_ref()),
        Seed::from(bs.as_slice()),
    ];
    let mut transfer = vec![12];
    transfer.extend_from_slice(&tokens.to_le_bytes());
    transfer.push(6);
    cpi(
        &TOKEN_2022,
        &[
            (&a[6], true, false),
            (&a[5], false, false),
            (&a[7], true, false),
            (&a[4], false, true),
        ],
        &transfer,
        &[Signer::from(seeds.as_slice())],
    )?;
    if change > 0 {
        Transfer {
            from: &a[4],
            to: &a[1],
            lamports: change,
        }
        .invoke_signed(&[Signer::from(seeds.as_slice())])?;
    }
    let rent = a[3].lamports();
    let dest = add(a[1].lamports(), rent)?;
    a[3].set_lamports(0);
    a[3].close()?;
    a[1].set_lamports(dest);
    Ok(())
}
