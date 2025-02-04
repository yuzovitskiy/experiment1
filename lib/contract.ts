import { ethers } from "ethers";
import { abi } from "./abi";

export function getContract() {
  if (!process.env.PRIVATE_KEY || !process.env.NEXT_PUBLIC_CONTRACT_ADDRESS) {
    throw new Error("Missing environment variables");
  }

  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  
  return new ethers.Contract(
    process.env.NEXT_PUBLIC_CONTRACT_ADDRESS,
    abi,
    wallet
  );
}
