
require('dotenv').config();
const express=require('express');
const bodyParser=require('body-parser');
const cors=require('cors');

const {
  Connection,PublicKey,Keypair,LAMPORTS_PER_SOL,Transaction
}=require('@solana/web3.js');

const {
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  TOKEN_PROGRAM_ID
}=require('@solana/spl-token');

const app=express();
app.use(cors());
app.use(bodyParser.json());

const connection=new Connection(process.env.RPC,"confirmed");

// Load presale wallet
const presaleKeypair=Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(process.env.PRESALE_WALLET_SECRET))
);

const presalePubkey=new PublicKey(process.env.PRESALE_WALLET_PUBKEY);
const mint=new PublicKey(process.env.MINT_ADDRESS);

const DECIMALS=parseInt(process.env.DECIMALS);
const TOKENS_PER_SOL=BigInt(process.env.TOKENS_PER_SOL);

async function verifyPayment(signature){
  const tx=await connection.getTransaction(signature,{commitment:'confirmed'});
  if(!tx||!tx.meta)return null;

  const keys=tx.transaction.message.accountKeys.map(k=>k.toString());
  const idx=keys.indexOf(presalePubkey.toString());
  if(idx===-1)return null;

  const pre=tx.meta.preBalances[idx];
  const post=tx.meta.postBalances[idx];
  const lamports=post-pre;

  if(lamports<=0)return null;
  return lamports;
}

app.post('/verify',async(req,res)=>{
  try{
    const {signature,buyer}=req.body;

    const lamports=await verifyPayment(signature);
    if(!lamports)return res.status(400).send({error:"Invalid payment"});

    const buyerPubkey=new PublicKey(buyer);

    const tokens=(BigInt(lamports)*TOKENS_PER_SOL*BigInt(10**DECIMALS))/BigInt(LAMPORTS_PER_SOL);

    const buyerAta=await getOrCreateAssociatedTokenAccount(
      connection,presaleKeypair,mint,buyerPubkey
    );

    const presaleAta=await getOrCreateAssociatedTokenAccount(
      connection,presaleKeypair,mint,presalePubkey
    );

    const ix=createTransferInstruction(
      presaleAta.address,buyerAta.address,presaleKeypair.publicKey,
      Number(tokens),[],TOKEN_PROGRAM_ID
    );

    const tx=new Transaction().add(ix);
    const txid=await connection.sendTransaction(tx,[presaleKeypair]);

    res.send({success:true,txid});
  }catch(e){
    console.log(e);
    res.status(500).send({error:e.message});
  }
});

const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log("Backend running on port",PORT));
