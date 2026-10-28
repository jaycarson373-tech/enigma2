# Enigma 2 compiled release

Artifact: enigma2.so. Source: programs/enigma2.

SHA-256: c57c1938c3027c87ca18f1d230399ea500a48417f2d251a1f1ae112e7985ef4e
Size: 130136 bytes.

Built with Agave/Solana 3.1.10, SBF platform tools 1.52 and its Rust 1.89.0
compiler. Cargo.lock is committed; release has overflow checks, LTO and stripped
symbols. Rebuild with:

```sh
NO_DNA=1 cargo-build-sbf --manifest-path programs/enigma2/Cargo.toml -- --locked --jobs 2
```

Actual pinned Stonk execution and loader/restart tests pass. This binary has not
been deployed to mainnet. V2 client identity defaults to a local test candidate;
the actual program address derives from the connected funding wallet and this
hash. Public activation requires reviewed deployment and funded acceptance.
