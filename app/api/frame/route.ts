import { NextRequest } from "next/server";
import { getFrameHtml, validateFrameMessage } from "frames.js";
import { getContract } from "@/lib/contract";
// GET: Initial frame display
export async function GET(req: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  
  const metadata = getFrameHtml({
    buttons: [
      {
        label: "Mint NFT",
        action: "post" as const,
        target: `${baseUrl}/api/frame`
      }
    ],
    image: `${baseUrl}/images/preview.png`,
    postUrl: `${baseUrl}/api/frame`,
    version: "vNext",
    title: "Mint Your NFT"
  });

  return new Response(
    `<!DOCTYPE html>
    <html>
      <head>
        ${metadata}
        <title>Mint NFT Frame</title>
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
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  
  const { isValid, message } = await validateFrameMessage(body);
  if (!isValid || !message) {
    return new Response("Invalid frame message", { status: 400 });
  }

  try {
    // Get contract and mint
    const contract = getContract();
    const tx = await contract.mint(1); // Mint 1 NFT for now
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
