import { NextRequest } from "next/server";
import { getFrameHtml, getFrameMessage } from "frames.js";
import { getContract } from "@/lib/contract";
import { supabase } from '@/lib/supabase';

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
              label: "Start Minting Process",
              action: "post"
            }
          ],
          image: `${baseUrl}/images/preview.png`,
          version: "vNext",
          title: `Cute Cow NFT (${contractAddress})`,
          inputText: "Enter your full name",
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

// POST: Handle multi-step form and mint
export async function POST(req: NextRequest) {
  const body = await req.json();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  
  const frameMessage = await getFrameMessage(body);
  
  if (!frameMessage) {
    return new Response("Invalid message", { status: 400 });
  }

  // Get the input text if provided
  const inputText = frameMessage.inputText || '';
  const buttonIndex = frameMessage.buttonIndex || 0;

  try {
    // Step 1: Name input
    if (!frameMessage.inputText) {
      return getFormResponse("Enter your full name", "Continue to shipping address", "Enter your full name");
    }

    // Step 2: Address input
    if (!inputText.includes(',')) {
      return getFormResponse(
        "Enter shipping address", 
        "Confirm and Mint", 
        `Name: ${inputText}\nEnter your shipping address`
      );
    }

    // Step 3: Confirmation and mint
    const [name, address] = inputText.split(',').map(s => s.trim());
    if (!name || !address) {
      throw new Error("Invalid input format");
    }

    // Store shipping info
    const { error: dbError } = await supabase
      .from('shipping_info')
      .insert({
        wallet_address: address,
        full_name: name,
        shipping_address: address
      });

    if (dbError) {
      throw new Error('Failed to store shipping information');
    }
    
    // Get contract and mint
    const contract = getContract();
    const tx = await contract.mint(address);
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
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
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
            title: "Error: " + errorMessage,
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

function getFormResponse(title: string, buttonLabel: string, inputPrompt: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  
  return new Response(
    `<!DOCTYPE html>
    <html>
      <head>
        ${getFrameHtml({
          buttons: [
            {
              label: buttonLabel,
              action: "post"
            }
          ],
          image: `${baseUrl}/images/form.png`,
          version: "vNext",
          title: title,
          inputText: inputPrompt,
        })}
      </head>
    </html>`,
    {
      headers: { "Content-Type": "text/html" },
    }
  );
}
