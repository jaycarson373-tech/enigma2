use pinocchio::error::ProgramError;
uint::construct_uint! { pub struct U256(4); }
pub fn add(a: u64, b: u64) -> Result<u64, ProgramError> {
    a.checked_add(b).ok_or(ProgramError::ArithmeticOverflow)
}
pub fn sub(a: u64, b: u64) -> Result<u64, ProgramError> {
    a.checked_sub(b).ok_or(ProgramError::ArithmeticOverflow)
}
pub fn share(a: u64, w: u64, total: u64) -> Result<u64, ProgramError> {
    if total == 0 {
        return Err(ProgramError::InvalidArgument);
    }
    u64::try_from(a as u128 * w as u128 / total as u128)
        .map_err(|_| ProgramError::ArithmeticOverflow)
}
pub fn sold(g: u64, vt: u64, vq: u64) -> Result<u64, ProgramError> {
    let den = add(vq, g)? as u128;
    u64::try_from((g as u128) * (vt as u128) / den).map_err(|_| ProgramError::ArithmeticOverflow)
}
// Exact integer operation order in the official constant-product LaunchLab SDK.
pub fn reserves(supply: u64, sell: u64, raise: u64, fee: u64) -> Result<(u64, u64), ProgramError> {
    let remainder = sub(supply, sell)?;
    let net = sub(raise, fee)?;
    if remainder == 0 || net == 0 {
        return Err(ProgramError::InvalidArgument);
    }
    let q = U256::from(net);
    let s = U256::from(sell);
    let r = U256::from(remainder);
    let f = U256::from(raise);
    let bottom = q * s / r;
    if bottom <= f {
        return Err(ProgramError::InvalidArgument);
    }
    let bottom = bottom - f;
    let a = q * s * s / r / bottom;
    let b = f * f / bottom;
    if a > U256::from(u64::MAX) || b > U256::from(u64::MAX) {
        return Err(ProgramError::ArithmeticOverflow);
    }
    Ok((a.low_u64(), b.low_u64()))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exact_stonk_reserves() {
        assert_eq!(
            reserves(
                1_000_000_000_000_000,
                793_100_000_000_000,
                56_706_721_159_109,
                0
            )
            .unwrap(),
            (1_073_025_605_595_361, 20_014_705_915_761)
        );
    }
    #[test]
    fn accounting() {
        let (t, q) = reserves(
            1_000_000_000_000_000,
            793_100_000_000_000,
            56_706_721_159_109,
            0,
        )
        .unwrap();
        assert!(
            sold(1_000_000_000, t, q).unwrap()
                > sold(2_000_000_000, t, q).unwrap() - sold(1_000_000_000, t, q).unwrap()
        );
        for a in 0..1000 {
            assert!(
                share(a, 17, 101).unwrap()
                    + share(a, 31, 101).unwrap()
                    + share(a, 53, 101).unwrap()
                    <= a
            )
        }
        assert!(reserves(10, 11, 1, 0).is_err());
        assert!(share(1, 1, 0).is_err());
        assert!(add(u64::MAX, 1).is_err());
    }
}
