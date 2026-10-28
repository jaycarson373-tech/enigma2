//! Independent Enigma 2 STONK escrow and atomic standard Stonk LaunchLab launch.
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
use math::{add, reserves, share, sold, sub};
use state::*;
#[cfg(not(feature = "no-entrypoint"))]
pinocchio::entrypoint!(process_instruction);
const INVALID: ProgramError = ProgramError::InvalidArgument;
const VERSION: u8 = 2;
const BUDGET: u64 = 20_000_000;
const SUPPLY: u64 = 1_000_000_000_000_000;
const SELL: u64 = 793_100_000_000_000;
include!("common.rs");
fn config(a: &AccountView, id: &Address) -> Result<Config, ProgramError> {
    let c: Config = read(a, id, &DISC_CONFIG)?;
    require(c.version == VERSION && pda(a, &[b"config-v2"], id)? == c.bump)?;
    Ok(c)
}
fn offering(a: &AccountView, id: &Address) -> Result<Offering, ProgramError> {
    let o: Offering = read(a, id, &DISC_OFFERING)?;
    require(o.version == VERSION && pda(a, &[b"offering-v2", &o.id.to_le_bytes()], id)? == o.bump)?;
    Ok(o)
}
fn vault(a: &AccountView, o: &AccountView, b: u8, id: &Address) -> ProgramResult {
    require(pda(a, &[b"vault-v2", o.address().as_ref()], id)? == b)?;
    system_wallet(a)?;
    writable(a)
}
fn ata(a: &AccountView, mint: &Address, owner: &Address, token: &Address) -> ProgramResult {
    pda(a, &[owner.as_ref(), token.as_ref(), mint.as_ref()], &ATA)?;
    Ok(())
}
fn amount_at(a: &AccountView, offset: usize) -> Result<u64, ProgramError> {
    let d = a.try_borrow()?;
    let s = d
        .get(offset..offset + 8)
        .ok_or(ProgramError::InvalidAccountData)?;
    Ok(u64::from_le_bytes(s.try_into().map_err(|_| INVALID)?))
}
fn token_balance(
    a: &AccountView,
    mint: &Address,
    owner: &Address,
    token: &Address,
) -> Result<u64, ProgramError> {
    require(a.owned_by(token) && !a.executable())?;
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
fn escrow_balance(
    a: &AccountView,
    mint: &Address,
    owner: &Address,
    token: &Address,
) -> Result<u64, ProgramError> {
    let balance = token_balance(a, mint, owner, token)?;
    let d = a.try_borrow()?;
    require(d[72..76] == [0; 4] && d[121..129] == [0; 8] && d[129..133] == [0; 4])?;
    Ok(balance)
}
fn standard_mint(a: &AccountView) -> ProgramResult {
    require(a.owned_by(&TOKEN_2022) && !a.executable())?;
    let d = a.try_borrow()?;
    require(
        d.len() >= 166
            && d[..4] == [0; 4]
            && d[44] == 6
            && d[45] == 1
            && d[46..50] == [0; 4]
            && d[165] == 1,
    )?;
    require(u64::from_le_bytes(d[36..44].try_into().map_err(|_| INVALID)?) == SUPPLY)?;
    let mut n = 166;
    while n + 4 <= d.len() {
        let kind = u16::from_le_bytes(d[n..n + 2].try_into().map_err(|_| INVALID)?);
        if kind == 0 {
            require(d[n..].iter().all(|b| *b == 0))?;
            break;
        }
        let len = u16::from_le_bytes(d[n + 2..n + 4].try_into().map_err(|_| INVALID)?) as usize;
        // Standard Stonk metadata only; no transfer fees, hooks or delegates.
        require(kind == 18 || kind == 19)?;
        n = n.checked_add(4 + len).ok_or(INVALID)?;
        require(n <= d.len())?;
    }
    Ok(())
}
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
fn transfer_tokens(
    source: &AccountView,
    mint: &AccountView,
    dest: &AccountView,
    owner: &AccountView,
    program: &Address,
    amount: u64,
    decimals: u8,
    seeds: &[Signer],
) -> ProgramResult {
    let mut data = vec![12];
    data.extend_from_slice(&amount.to_le_bytes());
    data.push(decimals);
    cpi(
        program,
        &[
            (source, true, false),
            (mint, false, false),
            (dest, true, false),
            (owner, false, true),
        ],
        &data,
        seeds,
    )
}
fn rule_allows(d: &[u8], raise: u64) -> Result<bool, ProgramError> {
    require(
        d.len() >= 150
            && d.len() <= 8192
            && d[..8] == DISC_RULE
            && d[9] == 1
            && d[10..42] == PLATFORM.as_ref()[..]
            && d[42..74] == GLOBAL.as_ref()[..],
    )?;
    let fields = [
        0u128,
        1,
        0,
        SUPPLY as u128,
        SELL as u128,
        raise as u128,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        SELL as u128 * 1_000_000 / SUPPLY as u128,
        0,
        (SUPPLY - SELL) as u128,
        (SUPPLY - SELL) as u128 * 1_000_000 / SUPPLY as u128,
        raise as u128 * 1_000_000 / SUPPLY as u128,
        Clock::get()?.unix_timestamp as u128,
    ];
    let mut pos = 146;
    let u32at = |p: usize| -> Result<u32, ProgramError> {
        Ok(u32::from_le_bytes(
            d.get(p..p + 4)
                .ok_or(INVALID)?
                .try_into()
                .map_err(|_| INVALID)?,
        ))
    };
    let groups = u32at(pos)?;
    pos += 4;
    require(groups > 0 && groups <= 10)?;
    let mut any = false;
    for _ in 0..groups {
        pos = pos.checked_add(10).ok_or(INVALID)?;
        let n = u32at(pos)?;
        pos += 4;
        require(n > 0 && n <= 25)?;
        let mut ok = true;
        for _ in 0..n {
            let c = d.get(pos..pos + 18).ok_or(INVALID)?;
            pos += 18;
            let expect = u128::from_le_bytes(c[2..18].try_into().map_err(|_| INVALID)?);
            ok &= match fields.get(c[0] as usize) {
                Some(v) => match c[1] {
                    0 => *v == expect,
                    1 => *v >= expect,
                    2 => *v <= expect,
                    3 => *v != expect,
                    _ => false,
                },
                None => false,
            };
        }
        any |= ok;
    }
    Ok(any)
}
fn venue(
    c: &AccountView,
    p: &AccountView,
    r: &AccountView,
    allow: &AccountView,
    raise: u64,
) -> Result<([u8; 32], u64, u64), ProgramError> {
    key(c, &GLOBAL)?;
    key(p, &PLATFORM)?;
    require(
        c.owned_by(&LAUNCHLAB)
            && p.owned_by(&LAUNCHLAB)
            && r.owned_by(&LAUNCHLAB)
            && !c.executable()
            && !p.executable()
            && !r.executable(),
    )?;
    pda(
        r,
        &[b"platform_curve_rule", PLATFORM.as_ref(), GLOBAL.as_ref()],
        &LAUNCHLAB,
    )?;
    pda(
        allow,
        &[b"platform_allow_config", PLATFORM.as_ref(), GLOBAL.as_ref()],
        &LAUNCHLAB,
    )?;
    let cd = c.try_borrow()?;
    let pd = p.try_borrow()?;
    let rd = r.try_borrow()?;
    let ad = allow.try_borrow()?;
    require(
        cd.len() == 371
            && cd[..8] == DISC_GLOBAL
            && cd[16] == 0
            && cd[83..115] == STONK.as_ref()[..]
            && pd.len() == 944
            && pd[..8] == DISC_PLATFORM
            && pd[832] <= 1
            && pd[833] <= 1,
    )?;
    require(
        pd[832] == 0
            || (allow.owned_by(&LAUNCHLAB)
                && !allow.executable()
                && ad.len() >= 8
                && ad.len() <= 2048),
    )?;
    require(rule_allows(&rd, raise)?)?;
    let u64at = |d: &[u8], n: usize| -> u64 { u64::from_le_bytes(d[n..n + 8].try_into().unwrap()) };
    require(u64at(&cd, 19) == 0 && raise >= u64at(&cd, 75) && SUPPLY >= u64at(&cd, 43))?;
    let fees = add(add(u64at(&cd, 27), u64at(&pd, 104))?, u64at(&pd, 720))?;
    require(fees <= 50_000)?;
    let (vt, vq) = reserves(SUPPLY, SELL, raise, 0)?;
    require(vt > SELL && vq > 0)?;
    let hash = solana_sha256_hasher::hashv(&[&cd, &pd, &rd, &ad]).to_bytes();
    Ok((hash, vt, vq))
}
pub fn process_instruction(id: &Address, a: &mut [AccountView], data: &[u8]) -> ProgramResult {
    require(data.len() >= 8)?;
    let (d, args) = data.split_at(8);
    if d == IX_INITIALIZE {
        initialize(id, a, args)
    } else if d == IX_PAUSE {
        pause(id, a, args)
    } else if d == IX_FILE {
        file(id, a, args)
    } else if d == IX_COMMIT {
        commit(id, a, args)
    } else if d == IX_LAUNCH {
        require(args.is_empty())?;
        launch(id, a)
    } else if d == IX_CLAIM {
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
    require(a[3].executable() && a[3].owned_by(&LOADER) && a[4].owned_by(&LOADER))?;
    pda(&a[4], &[id.as_ref()], &LOADER)?;
    {
        let p = a[3].try_borrow()?;
        let d = a[4].try_borrow()?;
        require(
            p.len() == 36
                && p[..4] == 2u32.to_le_bytes()
                && p[4..36] == a[4].address().as_ref()[..]
                && d.len() >= 45
                && d[..4] == 3u32.to_le_bytes()
                && d[12] == 1
                && d[13..45] == a[0].address().as_ref()[..],
        )?;
    }
    let bump = pda(&a[1], &[b"config-v2"], id)?;
    let bs = [bump];
    let seeds = [Seed::from(b"config-v2"), Seed::from(bs.as_slice())];
    fresh_pda(&a[0], &a[1], id, &seeds, 64)?;
    let c = Config {
        version: VERSION,
        operator: a[0].address().to_bytes(),
        paused: false,
        next_id: 0,
        bump,
    };
    write(&mut a[1], &DISC_CONFIG, &c)
}
fn pause(id: &Address, a: &mut [AccountView], args: &[u8]) -> ProgramResult {
    require(a.len() == 2 && args.len() == 1 && args[0] <= 1)?;
    signer(&a[0])?;
    let mut c = config(&a[1], id)?;
    require(c.operator == a[0].address().to_bytes())?;
    c.paused = args[0] == 1;
    write(&mut a[1], &DISC_CONFIG, &c)
}
fn file(id: &Address, a: &mut [AccountView], args: &[u8]) -> ProgramResult {
    require(a.len() == 14)?;
    signer(&a[0])?;
    writable(&a[0])?;
    system_wallet(&a[0])?;
    key(&a[5], &STONK)?;
    key(&a[6], &TOKEN)?;
    key(&a[7], &ATA)?;
    key(&a[8], &SYSTEM)?;
    key(&a[13], &LAUNCHLAB)?;
    require(a[13].executable())?;
    let mut c = config(&a[1], id)?;
    require(!c.paused)?;
    let t = Terms::try_from_slice(args).map_err(|_| ProgramError::InvalidInstructionData)?;
    require(
        !t.name.trim().is_empty()
            && t.name.len() <= 32
            && !t.symbol.is_empty()
            && t.symbol.len() <= 10
            && t.symbol.bytes().all(|b| b.is_ascii_alphanumeric())
            && t.uri.len() <= 200
            && t.uri.starts_with("https://")
            && (60..=3600).contains(&t.duration)
            && t.duration % 60 == 0
            && (10..=1000).contains(&t.cap_bps),
    )?;
    {
        let m = a[5].try_borrow()?;
        require(a[5].owned_by(&TOKEN) && m.len() == 82 && m[44] == 9 && m[45] == 1)?;
    }
    let (hash, vt, vq) = venue(&a[9], &a[10], &a[11], &a[12], t.raise)?;
    let number = c.next_id.to_le_bytes();
    let bump = pda(&a[2], &[b"offering-v2", &number], id)?;
    let vb = pda(&a[3], &[b"vault-v2", a[2].address().as_ref()], id)?;
    system_wallet(&a[3])?;
    ata(&a[4], &STONK, a[3].address(), &TOKEN)?;
    let bs = [bump];
    let seeds = [
        Seed::from(b"offering-v2"),
        Seed::from(number.as_slice()),
        Seed::from(bs.as_slice()),
    ];
    fresh_pda(&a[0], &a[2], id, &seeds, 768)?;
    Transfer {
        from: &a[0],
        to: &a[3],
        lamports: add(BUDGET, Rent::get()?.try_minimum_balance(0)?)?,
    }
    .invoke()?;
    create_ata(a, 0, 4, 3, 5, 8, 6)?;
    let now = Clock::get()?.unix_timestamp;
    let o = Offering {
        version: VERSION,
        id: c.next_id,
        creator: a[0].address().to_bytes(),
        status: 1,
        closes_at: now.checked_add(t.duration).ok_or(INVALID)?,
        cap_bps: t.cap_bps,
        raise: t.raise,
        v_token: vt,
        v_quote: vq,
        raised: 0,
        weight: 0,
        backers: 0,
        venue_hash: hash,
        mint: [0; 32],
        received: 0,
        leftover: 0,
        creation_cost: 0,
        created_at: now,
        launched_at: 0,
        bump,
        vault_bump: vb,
        name: t.name,
        symbol: t.symbol,
        uri: t.uri,
    };
    c.next_id = add(c.next_id, 1)?;
    write(&mut a[1], &DISC_CONFIG, &c)?;
    write(&mut a[2], &DISC_OFFERING, &o)
}
fn commit(id: &Address, a: &mut [AccountView], args: &[u8]) -> ProgramResult {
    require(a.len() == 9 && args.len() == 8)?;
    signer(&a[0])?;
    writable(&a[0])?;
    system_wallet(&a[0])?;
    key(&a[6], &STONK)?;
    key(&a[7], &TOKEN)?;
    key(&a[8], &SYSTEM)?;
    let amount = u64::from_le_bytes(args.try_into().map_err(|_| INVALID)?);
    require(amount > 0)?;
    let mut o = offering(&a[1], id)?;
    require(o.status == 1 && Clock::get()?.unix_timestamp < o.closes_at)?;
    vault(&a[3], &a[1], o.vault_bump, id)?;
    ata(&a[4], &STONK, a[0].address(), &TOKEN)?;
    ata(&a[5], &STONK, a[3].address(), &TOKEN)?;
    token_balance(&a[4], &STONK, a[0].address(), &TOKEN)?;
    let before = escrow_balance(&a[5], &STONK, a[3].address(), &TOKEN)?;
    let pb = pda(
        &a[2],
        &[
            b"position-v2",
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
            version: VERSION,
            offering: a[1].address().to_bytes(),
            backer: a[0].address().to_bytes(),
            committed: 0,
            weight: 0,
            joined_at: Clock::get()?.unix_timestamp,
        }
    };
    let raised = add(o.raised, amount)?;
    require(raised < o.raise)?;
    let total = sold(raised, o.v_token, o.v_quote)?;
    require(total < SELL)?;
    let weight = sub(total, o.weight)?;
    require(weight > 0)?;
    p.weight = add(p.weight, weight)?;
    require(p.weight <= share(SUPPLY, o.cap_bps as u64, 10000)?)?;
    p.committed = add(p.committed, amount)?;
    if !existing {
        let bs = [pb];
        let seeds = [
            Seed::from(b"position-v2"),
            Seed::from(a[1].address().as_ref()),
            Seed::from(a[0].address().as_ref()),
            Seed::from(bs.as_slice()),
        ];
        fresh_pda(&a[0], &a[2], id, &seeds, 112)?;
        o.backers = o.backers.checked_add(1).ok_or(INVALID)?;
    }
    transfer_tokens(&a[4], &a[6], &a[5], &a[0], &TOKEN, amount, 9, &[])?;
    require(escrow_balance(&a[5], &STONK, a[3].address(), &TOKEN)? == add(before, amount)?)?;
    o.raised = raised;
    o.weight = total;
    write(&mut a[1], &DISC_OFFERING, &o)?;
    write(&mut a[2], &DISC_POSITION, &p)
}
fn launch(id: &Address, a: &mut [AccountView]) -> ProgramResult {
    require(a.len() == 24)?;
    signer(&a[0])?;
    signer(&a[1])?;
    writable(&a[0])?;
    system_wallet(&a[0])?;
    system_wallet(&a[1])?;
    let mut o = offering(&a[2], id)?;
    require(o.status == 1 && o.raised > 0 && Clock::get()?.unix_timestamp >= o.closes_at)?;
    vault(&a[3], &a[2], o.vault_bump, id)?;
    key(&a[6], &Address::new_from_array(o.creator))?;
    writable(&a[6])?;
    key(&a[15], &STONK)?;
    key(&a[16], &TOKEN)?;
    key(&a[17], &TOKEN_2022)?;
    key(&a[18], &ATA)?;
    key(&a[19], &SYSTEM)?;
    key(&a[20], &LAUNCHLAB)?;
    require(a[20].executable())?;
    require(venue(&a[7], &a[8], &a[9], &a[10], o.raise)? == (o.venue_hash, o.v_token, o.v_quote))?;
    pda(&a[11], &[b"vault_auth_seed"], &LAUNCHLAB)?;
    pda(
        &a[12],
        &[b"pool", a[1].address().as_ref(), STONK.as_ref()],
        &LAUNCHLAB,
    )?;
    pda(
        &a[13],
        &[
            b"pool_vault",
            a[12].address().as_ref(),
            a[1].address().as_ref(),
        ],
        &LAUNCHLAB,
    )?;
    pda(
        &a[14],
        &[b"pool_vault", a[12].address().as_ref(), STONK.as_ref()],
        &LAUNCHLAB,
    )?;
    pda(&a[21], &[b"__event_authority"], &LAUNCHLAB)?;
    pda(&a[22], &[PLATFORM.as_ref(), STONK.as_ref()], &LAUNCHLAB)?;
    pda(
        &a[23],
        &[a[6].address().as_ref(), STONK.as_ref()],
        &LAUNCHLAB,
    )?;
    ata(&a[4], &STONK, a[3].address(), &TOKEN)?;
    ata(&a[5], a[1].address(), a[3].address(), &TOKEN_2022)?;
    require(a[1].is_data_empty() && a[12].is_data_empty() && a[5].is_data_empty())?;
    let quote_before = escrow_balance(&a[4], &STONK, a[3].address(), &TOKEN)?;
    require(quote_before >= o.raised)?;
    let payer_before = a[0].lamports();
    let vault_before = a[3].lamports();
    require(vault_before >= add(BUDGET, Rent::get()?.try_minimum_balance(0)?)?)?;
    let mut create = vec![37, 190, 126, 222, 44, 154, 171, 17, 6];
    for s in [&o.name, &o.symbol, &o.uri] {
        create.extend_from_slice(&(s.len() as u32).to_le_bytes());
        create.extend_from_slice(s.as_bytes());
    }
    create.push(0);
    create.extend_from_slice(&SUPPLY.to_le_bytes());
    create.extend_from_slice(&SELL.to_le_bytes());
    create.extend_from_slice(&o.raise.to_le_bytes());
    create.push(1);
    create.extend_from_slice(&[0; 24]);
    create.extend_from_slice(&[0; 12]);
    cpi(
        &LAUNCHLAB,
        &[
            (&a[0], true, true),
            (&a[6], false, false),
            (&a[7], false, false),
            (&a[8], false, false),
            (&a[11], false, false),
            (&a[12], true, false),
            (&a[1], true, true),
            (&a[15], false, false),
            (&a[13], true, false),
            (&a[14], true, false),
            (&a[17], false, false),
            (&a[16], false, false),
            (&a[19], false, false),
            (&a[21], false, false),
            (&a[20], false, false),
            (&a[10], false, false),
            (&a[9], false, false),
        ],
        &create,
        &[],
    )?;
    create_ata(a, 0, 5, 3, 1, 19, 17)?;
    let min = share(o.weight, 9500, 10000)?.max(1);
    let mut buy = vec![250, 234, 13, 123, 213, 156, 19, 236];
    buy.extend_from_slice(&o.raised.to_le_bytes());
    buy.extend_from_slice(&min.to_le_bytes());
    buy.extend_from_slice(&0u64.to_le_bytes());
    let bs = [o.vault_bump];
    let seeds = [
        Seed::from(b"vault-v2"),
        Seed::from(a[2].address().as_ref()),
        Seed::from(bs.as_slice()),
    ];
    cpi(
        &LAUNCHLAB,
        &[
            (&a[3], true, true),
            (&a[11], false, false),
            (&a[7], false, false),
            (&a[8], false, false),
            (&a[12], true, false),
            (&a[5], true, false),
            (&a[4], true, false),
            (&a[13], true, false),
            (&a[14], true, false),
            (&a[1], false, false),
            (&a[15], false, false),
            (&a[17], false, false),
            (&a[16], false, false),
            (&a[21], false, false),
            (&a[20], false, false),
            (&a[19], false, false),
            (&a[22], true, false),
            (&a[23], true, false),
        ],
        &buy,
        &[Signer::from(seeds.as_slice())],
    )?;
    require(a[12].owned_by(&LAUNCHLAB))?;
    {
        let pool = a[12].try_borrow()?;
        require(
            pool.len() == 429
                && pool[..8] == DISC_POOL
                && pool[17] == 0
                && pool[18] == 6
                && pool[19] == 9
                && pool[20] == 1
                && pool[141..173] == GLOBAL.as_ref()[..]
                && pool[173..205] == PLATFORM.as_ref()[..]
                && pool[205..237] == a[1].address().as_ref()[..]
                && pool[237..269] == STONK.as_ref()[..]
                && pool[269..301] == a[13].address().as_ref()[..]
                && pool[301..333] == a[14].address().as_ref()[..]
                && pool[333..365] == o.creator
                && pool[365] == 1
                && pool[366] == 0,
        )?;
    }
    standard_mint(&a[1])?;
    let received = escrow_balance(&a[5], a[1].address(), a[3].address(), &TOKEN_2022)?;
    require(received >= min && received <= o.weight)?;
    let spent = sub(
        quote_before,
        escrow_balance(&a[4], &STONK, a[3].address(), &TOKEN)?,
    )?;
    require(spent > 0 && spent <= o.raised)?;
    let payer_cost = sub(payer_before, a[0].lamports())?;
    let vault_cost = sub(vault_before, a[3].lamports())?;
    let costs = add(payer_cost, vault_cost)?;
    require(costs <= BUDGET)?;
    if payer_cost > 0 {
        Transfer {
            from: &a[3],
            to: &a[0],
            lamports: payer_cost,
        }
        .invoke_signed(&[Signer::from(seeds.as_slice())])?;
    }
    let refund = sub(BUDGET, costs)?;
    if refund > 0 {
        Transfer {
            from: &a[3],
            to: &a[6],
            lamports: refund,
        }
        .invoke_signed(&[Signer::from(seeds.as_slice())])?;
    }
    o.status = 2;
    o.mint = a[1].address().to_bytes();
    o.received = received;
    o.leftover = sub(o.raised, spent)?;
    o.creation_cost = costs;
    o.launched_at = Clock::get()?.unix_timestamp;
    write(&mut a[2], &DISC_OFFERING, &o)
}
fn claim(id: &Address, a: &mut [AccountView]) -> ProgramResult {
    require(a.len() == 15)?;
    signer(&a[0])?;
    writable(&a[0])?;
    writable(&a[1])?;
    key(&a[10], &STONK)?;
    key(&a[11], &TOKEN)?;
    key(&a[12], &TOKEN_2022)?;
    key(&a[13], &ATA)?;
    key(&a[14], &SYSTEM)?;
    let o = offering(&a[2], id)?;
    require(o.status == 2 && o.weight > 0)?;
    vault(&a[4], &a[2], o.vault_bump, id)?;
    key(&a[5], &Address::new_from_array(o.mint))?;
    pda(
        &a[3],
        &[
            b"position-v2",
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
            && p.weight <= share(SUPPLY, o.cap_bps as u64, 10000)?,
    )?;
    ata(&a[6], a[5].address(), a[4].address(), &TOKEN_2022)?;
    ata(&a[7], a[5].address(), a[1].address(), &TOKEN_2022)?;
    ata(&a[8], &STONK, a[4].address(), &TOKEN)?;
    let tokens = share(o.received, p.weight, o.weight)?;
    require(tokens <= share(SUPPLY, o.cap_bps as u64, 10000)?)?;
    let change = share(o.leftover, p.weight, o.weight)?;
    escrow_balance(&a[6], a[5].address(), a[4].address(), &TOKEN_2022)?;
    create_ata(a, 0, 7, 1, 5, 14, 12)?;
    let bs = [o.vault_bump];
    let seeds = [
        Seed::from(b"vault-v2"),
        Seed::from(a[2].address().as_ref()),
        Seed::from(bs.as_slice()),
    ];
    transfer_tokens(
        &a[6],
        &a[5],
        &a[7],
        &a[4],
        &TOKEN_2022,
        tokens,
        6,
        &[Signer::from(seeds.as_slice())],
    )?;
    ata(&a[9], &STONK, a[1].address(), &TOKEN)?;
    if change > 0 {
        create_ata(a, 0, 9, 1, 10, 14, 11)?;
        transfer_tokens(
            &a[8],
            &a[10],
            &a[9],
            &a[4],
            &TOKEN,
            change,
            9,
            &[Signer::from(seeds.as_slice())],
        )?;
    }
    let rent = a[3].lamports();
    let dest = add(a[1].lamports(), rent)?;
    a[3].set_lamports(0);
    a[3].close()?;
    a[1].set_lamports(dest);
    Ok(())
}
