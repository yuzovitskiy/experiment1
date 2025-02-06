import { NextRequest } from "next/server";
import { getFrameHtml, getFrameMessage } from "frames.js";
import { getContract } from "@/lib/contract";
import { supabase } from '@/lib/supabase';
import sharp from 'sharp';

// Add function to validate address using Google Places API
async function validateAddress(address: string) {
  const response = await fetch(
    `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(address)}&types=address&key=${process.env.GOOGLE_PLACES_API_KEY}`
  );
  
  const data = await response.json();
  
  if (data.status === 'OK' && data.predictions.length > 0) {
    // Get full address details using the place_id
    const placeResponse = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${data.predictions[0].place_id}&key=${process.env.GOOGLE_PLACES_API_KEY}`
    );
    
    const placeData = await placeResponse.json();
    
    if (placeData.status === 'OK') {
      return {
        isValid: true,
        formattedAddress: placeData.result.formatted_address
      };
    }
  }
  
  return {
    isValid: false,
    formattedAddress: null
  };
}

async function createAddressPreview(address: string) {
  console.log('Creating preview for address:', address);
  
  // Create SVG
  const svg = `
    <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="630" fill="white"/>
      <text 
        x="600" 
        y="250" 
        font-family="sans-serif"
        font-size="48" 
        text-anchor="middle" 
        fill="black"
      >Shipping Address</text>
      <text 
        x="600" 
        y="350" 
        font-family="sans-serif"
        font-size="40" 
        text-anchor="middle" 
        fill="black"
      >${address}</text>
    </svg>
  `;

  // Convert SVG directly to base64
  const base64Svg = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${base64Svg}`;
}

// GET: Initial frame display
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
  
      const inputAddress = frameMessage.inputText;
      const userAddress = frameMessage.requesterVerifiedAddresses?.[0];
      const userName = frameMessage.requesterUserData?.displayName;
  
      if (!userAddress) {
        throw new Error('No verified address found');
      }

      // If we have a state, it means user is confirming the address
      if (frameMessage.state) {
        // Check which button was clicked
        if (frameMessage.buttonIndex === 1) {  // Confirm & Mint
          // Store in Supabase
          const { error: dbError } = await supabase
            .from('shipping_info')
            .insert([{ 
              user_name: userName,
              shipping_address: frameMessage.state,
              wallet_address: userAddress,
              fid: frameMessage.requesterFid
            }]);

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
        } else {  // Try Again
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
      }

      // Initial address validation
      if (!inputAddress) {
        throw new Error('No address provided');
      }
      
      const { isValid, formattedAddress } = await validateAddress(inputAddress);
      
      if (!isValid) {
        return new Response(
          `<!DOCTYPE html><html><head>${getFrameHtml({
            buttons: [{ label: "Try Again", action: "post" }],
            image: `${baseUrl}/images/preview.png`,
            version: "vNext",
            title: "Invalid address. Please enter a valid shipping address.",
            inputText: "Your shipping address"
          })}</head></html>`,
          { headers: { "Content-Type": "text/html" }}
        );
      }
  
      // Show formatted address and ask for confirmation
      return new Response(
        `<!DOCTYPE html><html><head>${getFrameHtml({
          buttons: [
            { label: "Confirm & Mint", action: "post" },
            { label: "Try Again", action: "post" }
          ],
          image: await createAddressPreview(formattedAddress),  
          version: "vNext",
          title: "Please confirm your shipping address",
          state: formattedAddress
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