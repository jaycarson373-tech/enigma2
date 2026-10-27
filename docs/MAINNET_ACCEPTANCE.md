# Enigma: funded release and acceptance review

No public transaction is authorized by this document. Do not request a private key.

## Prepared artifact

Code hash: `99d8cec59e5022b8111df645821412472d8fe24bc534f75930a81adbefde341a`.
The artifact, locked windows/caps and economic policy are unchanged. Current
read-only preflight matches the Pump, Pump Fee and Mayhem program pins on mainnet.

## Funding/deployment review

The public funding-wallet address is the remaining deployment input. Its wallet
retains upgrade authority. Program/buffer addresses derive from that wallet and
the reviewed hash, so a predecessor's candidate must not be deployed blindly.
The local wallet console displays the actual recipient accounts, initial deposit
and maximum observed costs, simulates and then asks the owner to sign. No operator
private key or creator-wallet key needs to be given to the app or this chat.

At the latest check the conservative peak available balance is 1.154780560 SOL,
including a 0.02 SOL network-fee allowance and temporary upload buffer. Refresh
before approving. The retained account deposits are 0.571159640 SOL, of which
0.002174240 SOL has no recovery instruction in this release. Other account rent
can be reclaimed only with retained authority and the relevant shutdown steps;
closing the program retires that program address. Actual network fees are spent.
Funding the wallet is not approval to spend: the owner reviews the concrete plan.

## Separate acceptance request (prepare only)

Suggested test identity: Enigma Check / EGMTEST. Duration: 1 minute. Wallet cap:
50 basis points. Initial pooled contribution: 0.01 SOL. Creation budget: 0.02 SOL,
with observed setup costs reimbursed and the unused part returned to the creator.
Suggested maximum test debits: 0.05 SOL inclusive of account rent and network
fees, separate from program deployment. No extra trade, transfer or operator
sweep is included. Obtain the concrete wallet/program and owner approval first.

1. Verify finalized deployed bytecode, loader state, authority, configuration and
   freshly populated address table against the actual deployment receipts.
2. Enable only a controlled acceptance deployment; the public customer site stays
   paused. Verify metadata/image hosting and the connected wallet identity.
3. Open the one-minute window with the 0.01 SOL initial contribution in the same
   transaction. Record exact reviewed costs and finalized offering/position state.
4. After the onchain close, prepare and simulate atomic Pump create + pooled buy.
   Sign only that exact wire. A missed signature is reconciled before a retry.
5. Verify mint/creator/curve identity, actual token receipt, budget refund, wallet
   cap, account ownership, transaction effects and recorded creation costs.
6. Claim to the original recorded backer. Verify actual token and SOL balances,
   finalized receipt and position closure. Confirm another claim is rejected.
7. Refresh the browser and wallet session. Recover each original signature and
   ensure no repeat payment, incorrect wallet claim or duplicate mint occurs.
8. Publish the exact manifest and receipts only after the checks pass; enable the
   public customer flow then. A deployment or configuration check is not this test.

Enigma v1 has final deposits and no failed-launch refund instruction. This is shown
in the deposit/creation wallet review and linked custody documentation. No
unattended funded finalizer is included: a wallet must finalize after the window.
No independent audit, perfect bot exclusion or guaranteed launch result is claimed.
