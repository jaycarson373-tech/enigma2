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
