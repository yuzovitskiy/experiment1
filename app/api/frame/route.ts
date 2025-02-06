import { NextRequest } from "next/server";
import { getFrameHtml, getFrameMessage } from "frames.js";
import { getContract } from "@/lib/contract";
import { supabase } from '@/lib/supabase';

// GET: Initial frame display
export async function POST(req: NextRequest) {
    console.log('=== START REQUEST ===');
    
    try {
      const body = await req.json();
      console.log('Raw body:', JSON.stringify(body, null, 2));
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  
      // Check for vNext protocol
      if (body.clientProtocol === "farcaster@vNext") {
        return new Response(
          `<!DOCTYPE html><html><head>${getFrameHtml({
            buttons: [{ label: "Submit", action: "post" }],
            image: `${baseUrl}/images/preview.png`,
            version: "vNext",
            title: "Enter shipping address",
            inputText: "Your shipping address"
          })}</head></html>`,
          { headers: { "Content-Type": "text/html" }}
        );
      }
  
      const frameMessage = await getFrameMessage(body);
      console.log('Frame message:', frameMessage);
  
      const shippingAddress = frameMessage.inputText;
      const userAddress = frameMessage.requesterVerifiedAddresses?.[0];
      const userName = frameMessage.requesterUserData?.displayName;
  
      if (!userAddress) {
        throw new Error('No verified address found');
      }
  
      console.log('Processing:', { userName, shippingAddress, userAddress });
      
      // Store data in Supabase
      const { error: dbError } = await supabase
        .from('shipping_info')
        .insert([
          { 
            user_name: userName,
            shipping_address: shippingAddress,
            wallet_address: userAddress,
            fid: frameMessage.requesterFid
          }
        ]);

      if (dbError) {
        console.error('Supabase Error:', dbError);
        throw new Error('Failed to store shipping information');
      }

      // Mint NFT
      const contract = getContract();
      const tx = await contract.mint(userAddress);
      await tx.wait();
  
      return new Response(
        `<!DOCTYPE html><html><head>${getFrameHtml({
          buttons: [{ 
            label: "View Transaction",
            action: "link",
            target: `https://basescan.org/tx/${tx.hash}`
          }],
          image: `${baseUrl}/images/success.png`,
          version: "vNext",
          title: "NFT Minted Successfully! 🎉"
        })}</head></html>`,
        { headers: { "Content-Type": "text/html" }}
      );
  
    } catch (error) {
      console.error('=== ERROR ===');
      console.error(error);
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
      return new Response(
        `<!DOCTYPE html><html><head>${getFrameHtml({
          buttons: [{ label: "Try Again", action: "post" }],
          image: `${baseUrl}/images/error.png`,
          version: "vNext",
          title: "Error: Please try again"
        })}</head></html>`,
        { headers: { "Content-Type": "text/html" }}
      );
    }
  }

export async function GET(req: NextRequest) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    if (!baseUrl) {
      throw new Error('Missing NEXT_PUBLIC_BASE_URL');
    }
    
    return new Response(
      `<!DOCTYPE html>
      <html>
        <head>
          <meta property="fc:frame" content="vNext" />
          <meta property="fc:frame:image" content="${baseUrl}/images/preview.png" />
          <meta property="fc:frame:button:1" content="Start" />
          <meta property="fc:frame:input:text" content="Enter your shipping address" />
          <meta property="og:image" content="${baseUrl}/images/preview.png" />
          <title>Enter shipping address</title>
        </head>
        <body>
          <h1>Farcaster Frame</h1>
          <p>Please view this frame on Warpcast.</p>
        </body>
      </html>`,
      {
        headers: { 
          "Content-Type": "text/html",
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    console.error('GET Error:', error);
    return new Response('Error loading frame', { status: 500 });
  }
}