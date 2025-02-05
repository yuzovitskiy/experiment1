import { NextRequest } from "next/server";
import { getFrameHtml, getFrameMessage } from "frames.js";
import { getContract } from "@/lib/contract";
// GET: Initial frame display
export async function GET(req: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  
  // Log for verification
  console.log({
    baseUrl,
    contractAddress,
    hasPrivateKey: !!process.env.PRIVATE_KEY
  });

  return new Response(
    `<!DOCTYPE html>
    <html>
      <head>
        ${getFrameHtml({
          buttons: [
            {
              label: "Mint NFT",
              action: "post",
              target: `${baseUrl}/api/frame`
            }
          ],
          image: `${baseUrl}/images/preview.png`,
          version: "vNext",
          title: `Mint Your Cute Cow NFT (${contractAddress})`,
        })}
      </head>
    </html>`,
    {
      headers: {
        "Content-Type": "text/html",
      },
    }
  );
}

// POST: Handle mint action
export async function POST(req: NextRequest) {
  const body = await req.json();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  
  const frameMessage = await getFrameMessage(body);
  
  // Debug logging
  console.log("Frame Message:", {
    fid: frameMessage?.requesterFid,
    address: frameMessage?.address,
    requesterVerifiedAddresses: frameMessage?.requesterVerifiedAddresses,
    requesterCustodyAddress: frameMessage?.requesterCustodyAddress,
    fullMessage: frameMessage
  });

  if (!frameMessage) {
    return new Response("Invalid message", { status: 400 });
  }

  try {
    // Get user's verified Ethereum address
    const userAddress = frameMessage.requesterVerifiedAddresses?.[0] || frameMessage.address;
    if (!userAddress) {
      throw new Error("No verified address found - please verify your address on Warpcast");
    }

    console.log("Minting to address:", userAddress);

    // Get contract and mint
    const contract = getContract();
    const tx = await contract.mint(userAddress);
    await tx.wait();

    return new Response(
      `<!DOCTYPE html>
      <html>
        <head>
          ${getFrameHtml({
            buttons: [
              {
                label: "View Transaction",
                action: "link",
                target: `https://basescan.org/tx/${tx.hash}`,
              }
            ],
            image: `${baseUrl}/images/success.png`,
            version: "vNext",
            title: "NFT Minted Successfully! 🎉",
          })}
        </head>
      </html>`,
      {
        headers: {
          "Content-Type": "text/html",
        },
      }
    );
  } catch (error) {
    console.error("Mint error:", error);
    return new Response(
      `<!DOCTYPE html>
      <html>
        <head>
          ${getFrameHtml({
            buttons: [
              {
                label: "Try Again",
                action: "post",
                target: `${baseUrl}/api/frame`
              }
            ],
            image: `${baseUrl}/images/error.png`,
            version: "vNext",
            title: "Minting Failed",
          })}
        </head>
      </html>`,
      {
        headers: {
          "Content-Type": "text/html",
        },
      }
    );
  }
}
