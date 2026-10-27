use pinocchio::error::ProgramError;
pub type Result<T> = core::result::Result<T, ProgramError>;
pub fn add(a: u64, b: u64) -> Result<u64> {
    a.checked_add(b).ok_or(ProgramError::ArithmeticOverflow)
}
pub fn sub(a: u64, b: u64) -> Result<u64> {
    a.checked_sub(b).ok_or(ProgramError::ArithmeticOverflow)
}
pub fn proportional(a: u64, w: u128, total: u128) -> Result<u64> {
    if total == 0 {
        return Err(ProgramError::InvalidArgument);
    }
    u64::try_from(
        (a as u128)
            .checked_mul(w)
            .ok_or(ProgramError::ArithmeticOverflow)?
            / total,
    )
    .map_err(|_| ProgramError::ArithmeticOverflow)
}
// No-fee curve weights are an upper bound on actual purchased tokens. The
// atomic launch verifies the same initial reserves and never distributes more.
pub fn sold(g: u64, vt: u64, vq: u64) -> Result<u64> {
    let den = add(vq, g)? as u128;
    let k = (vt as u128) * (vq as u128);
    let remaining = k / den + u128::from(k % den != 0);
    sub(
        vt,
        u64::try_from(remaining).map_err(|_| ProgramError::ArithmeticOverflow)?,
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn monotone_and_diminishing() {
        let (t, q) = (1_073_000_000_000_000, 30_000_000_000);
        let a = sold(50_000_000, t, q).unwrap();
        let b = sold(100_000_000, t, q).unwrap() - a;
        assert!(a > b && b > 0);
        assert_eq!(sold(0, t, q).unwrap(), 0);
    }
    #[test]
    fn proportional_conserves() {
        for amount in 0..1000 {
            let shares = [17u128, 31, 53];
            let paid: u64 = shares
                .iter()
                .map(|w| proportional(amount, *w, 101).unwrap())
                .sum();
            assert!(paid <= amount);
            assert!(amount - paid < 3);
        }
    }
    #[test]
    fn overflow_and_zero_fail() {
        assert!(add(u64::MAX, 1).is_err());
        assert!(sub(1, 2).is_err());
        assert!(proportional(10, 1, 0).is_err());
        assert!(sold(u64::MAX, 100, 1).is_err());
    }
}
