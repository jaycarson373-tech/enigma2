use borsh::{BorshDeserialize, BorshSerialize};
#[derive(BorshSerialize, BorshDeserialize)]
pub struct Config {
    pub version: u8,
    pub operator: [u8; 32],
    pub paused: bool,
    pub next_id: u64,
    pub bump: u8,
}
#[derive(BorshSerialize, BorshDeserialize)]
pub struct Offering {
    pub version: u8,
    pub id: u64,
    pub creator: [u8; 32],
    pub status: u8,
    pub closes_at: i64,
    pub cap_bps: u16,
    pub raise: u64,
    pub v_token: u64,
    pub v_quote: u64,
    pub raised: u64,
    pub weight: u64,
    pub backers: u32,
    pub venue_hash: [u8; 32],
    pub mint: [u8; 32],
    pub received: u64,
    pub leftover: u64,
    pub creation_cost: u64,
    pub created_at: i64,
    pub launched_at: i64,
    pub bump: u8,
    pub vault_bump: u8,
    pub name: String,
    pub symbol: String,
    pub uri: String,
}
#[derive(BorshSerialize, BorshDeserialize)]
pub struct Position {
    pub version: u8,
    pub offering: [u8; 32],
    pub backer: [u8; 32],
    pub committed: u64,
    pub weight: u64,
    pub joined_at: i64,
}
#[derive(BorshDeserialize)]
pub struct Terms {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub duration: i64,
    pub cap_bps: u16,
    pub raise: u64,
}
