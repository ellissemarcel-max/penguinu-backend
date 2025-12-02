require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const {
  Connection,
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  Transaction
} = require('@solana/web3.js');

const {
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  TOKEN_PROGRAM_ID
} = require('@solana/spl-token');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// -----------------------------
//  CONFIG + INITIALIZATION
// -----------------------------

const RPC = process.env.RPC;
const connection = new Connection(RPC, "confirmed");

const presaleSecret = JSON.parse(process.env.PRESALE_WALLET_SECRET);
const presaleKeypair = Keypair.fromSecretKey(new Uint8Array(presaleSecret));

const presalePubkey = new PublicKey(process.env.PRESALE_WALLET_PUBKEY);
const mint = new PublicKey(process.env.MINT_ADDRESS);

const DECIMALS = parseInt(process.env.DECIMALS);
const TOKENS_PER_SOL = BigInt(process.env.TOKENS_PER_SOL);

// -----------------------------
//  PAYMENT VERIFICATION
// -----------------------------
async function verifyPayment(signature) {
  try {
    const tx = await connection.getTransaction(signature, { commitment: 'confirmed' });
    if (!tx || !tx.meta) return null;

    const keys = tx.transaction.message.accountKeys.map(k => k.toString());
    const idx = keys.indexOf(presalePubkey.toString());
    if (idx === -1) return null;

    const pre = tx.meta.preBalances[idx];
    const post = tx.meta.postBalances[idx];
    const lamports = post - pre;

    if (lamports <= 0) return null;

    return lamports;
  } catch (err) {
    console.error("verifyPayment error:", err);
    return null;
  }
}

// -----------------------------
//  VERIFY + SEND TOKENS
// -----------------------------
app.post('/verify', async (req, res) => {
  try {
    const { signature, buyer } = req.body;
    if (!signature || !buyer)
      return res.status(400).json({ error: "Missing signature or buyer address" });

    const lamports = await verifyPayment(signature);
    if (!lamports) 
      return res.status(400).json({ error: "Invalid payment" });

    const buyerPubkey = new PublicKey(buyer);

    const tokens = (BigInt(lamports) * TOKENS_PER_SOL * BigInt(10 ** DECIMALS)) / BigInt(LAMPORTS_PER_SOL);

    const buyerAta = await getOrCreateAssociatedTokenAccount(
      connection,
      presaleKeypair,
      mint,
      buyerPubkey
    );

    const presaleAta = await getOrCreateAssociatedTokenAccount(
      connection,
      presaleKeypair,
      mint,
      presalePubkey
    );

    const ix = createTransferInstruction(
      presaleAta.address,
      buyerAta.address,
      presaleKeypair.publicKey,
      Number(tokens),
      [],
      TOKEN_PROGRAM_ID
    );

    const tx = new Transaction().add(ix);
    const txid = await connection.sendTransaction(tx, [presaleKeypair]);

    return res.json({ success: true, txid });

  } catch (err) {
    console.error("verify route error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// -----------------------------
//  START SERVER (REQUIRED FOR RENDER)
// -----------------------------
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});