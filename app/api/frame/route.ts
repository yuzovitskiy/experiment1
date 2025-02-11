import { NextRequest } from "next/server";
import { getFrameHtml, getFrameMessage } from "frames.js";
import { getContract } from "@/lib/contract";
import { supabase } from '@/lib/supabase';

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

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

async function createIntroPreview(count: number) {
  console.log('Creating preview with count:', count);
  // Add multiple random elements to force cache busting
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(7);
  const randomColor = `#${Math.floor(Math.random()*16777215).toString(16)}`;
  
  const svg = `
    <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="630" fill="white"/>
      <rect x="0" y="0" width="2" height="2" fill="${randomColor}" opacity="0.01"/>
      <text 
        x="600" 
        y="250" 
        font-family="sans-serif"
        font-size="48" 
        text-anchor="middle" 
        fill="black"
      >Mint Drop</text>
      <text 
        x="600" 
        y="350" 
        font-family="sans-serif"
        font-size="40" 
        text-anchor="middle" 
        fill="black"
      >Mint online, receive IRL</text>
      <text 
        x="600" 
        y="450" 
        font-family="sans-serif"
        font-size="36" 
        text-anchor="middle" 
        fill="black"
        style="filter: url(#shadow)"
      >${count}/100 Minted</text>
      <defs>
        <filter id="shadow">
          <feDropShadow dx="0" dy="0" stdDeviation="0.2" flood-opacity="0.1"/>
        </filter>
      </defs>
      <!-- Multiple unique identifiers to prevent caching -->
      <text x="0" y="0" opacity="0">${timestamp}</text>
      <text x="1" y="1" opacity="0">${randomId}</text>
      <text x="2" y="2" opacity="0">${count}</text>
    </svg>
  `;

  const base64Svg = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${base64Svg}`;
}

// Helper function to get current mint count
async function getMintCount() {
  const { count } = await supabase
    .from('shipping_info')
    .select('*', { count: 'exact', head: true })  // Added head: true for efficiency
    .throwOnError();  // This will help catch any DB errors
  console.log('Fetched count from DB:', count);  // Debug log
  return count || 0;
}

// GET: Initial frame with mint count
export async function GET(req: NextRequest) {
  const count = await getMintCount();
  const timestamp = Date.now();
  console.log('Initial frame count:', count);

  return new Response(
    `<!DOCTYPE html><html><head>${getFrameHtml({
      buttons: [{ label: "Get Started", action: "post" }],
      image: await createIntroPreview(count),
      version: "vNext",
      title: "Mint Drop",
      postUrl: `${baseUrl}/api/frame?t=${timestamp}&count=${count}`,
      state: "INTRO"
    })}</head></html>`,
    { 
      headers: { 
        "Content-Type": "text/html", 
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
      }
    }
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('=== START REQUEST ===');
    console.log('Raw body:', body);

    const frameMessage = await getFrameMessage(body);
    console.log('Frame message:', frameMessage);
    
    const userAddress = frameMessage.requesterVerifiedAddresses?.[0] || frameMessage.requesterCustodyAddress;
    const userName = frameMessage.requesterUserData?.displayName || 'Anonymous';

    console.log('Current State:', frameMessage.state); // Debug log

    // Handle intro screen "Get Started" button
    if (!frameMessage.state || frameMessage.state === "") {
      const count = await getMintCount();  // Get fresh count
      console.log('Showing categories after intro with count:', count); // Debug log
      return new Response(
        `<!DOCTYPE html><html><head>${getFrameHtml({
          buttons: [
            { label: "🥩 Steak", action: "post" },
            { label: "🍷 Wine", action: "post" },
            { label: "🔪 Knife", action: "post" }
          ],
          image: `${baseUrl}/images/categories.png`,  // Make sure this matches your categories image
          version: "vNext",
          title: "Select your free gift:",
          state: "CATEGORIES"
        })}</head></html>`,
        { headers: { "Content-Type": "text/html" }}
      );
    }

    // Handle category selection
    if (frameMessage.state === "CATEGORIES") {
      const categories = ["Steak", "Wine", "Knife"];
      const selectedCategory = categories[frameMessage.buttonIndex - 1];

      // Ask for shipping address
      return new Response(
        `<!DOCTYPE html><html><head>${getFrameHtml({
          buttons: [{ label: "Submit", action: "post" }],
          image: await createAddressPreview("Enter your shipping address"),
          version: "vNext",
          title: "Enter shipping address for your " + selectedCategory,
          inputText: "Your shipping address",
          state: `CATEGORY:${selectedCategory}`
        })}</head></html>`,
        { headers: { "Content-Type": "text/html" }}
      );
    }

    // Handle address input after category selection
    if (frameMessage.state && frameMessage.state.startsWith('CATEGORY:')) {
      const [_, selectedCategory] = frameMessage.state.split('CATEGORY:');
      const inputAddress = frameMessage.inputText;

      if (!inputAddress) {
        throw new Error('No address provided');
      }

      const { isValid, formattedAddress } = await validateAddress(inputAddress);

      if (!isValid) {
        throw new Error('Invalid address');
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
          state: `CONFIRM:${selectedCategory}:${formattedAddress}`
        })}</head></html>`,
        { headers: { "Content-Type": "text/html" }}
      );
    }

    // Handle address confirmation
    if (frameMessage.state && frameMessage.state.startsWith('CONFIRM:')) {
      const [_, selectedCategory, formattedAddress] = frameMessage.state.split(':');
      
      if (frameMessage.buttonIndex === 1) {  // Confirm
        // Store in Supabase
        const { error: dbError } = await supabase
          .from('shipping_info')
          .insert([{ 
            user_name: userName,
            shipping_address: formattedAddress,
            wallet_address: userAddress,
            fid: frameMessage.requesterFid,
            selected_category: selectedCategory
          }]);

        if (dbError) {
          throw new Error('Failed to store information');
        }

        // Get updated count after mint
        const updatedCount = await getMintCount();
        
        // Show success message with share button
        const shareText = `I just participated in a Mint Drop: Mint Online, Receive IRL. Getting a free ${selectedCategory} shipped to me. 🎁`;
        
        return new Response(
          `<!DOCTYPE html><html><head>${getFrameHtml({
            buttons: [
              { 
                label: "🔁 Share", 
                action: "link",  // Changed to "link" instead of "post_redirect"
                target: `https://warpcast.com/~/compose?text=${encodeURIComponent(shareText)}`  // Using target instead of postUrl
              }
            ],
            image: await createIntroPreview(updatedCount),  // Show updated count
            version: "vNext",
            title: `Thanks! Your ${selectedCategory} will be shipped to ${formattedAddress}`
          })}</head></html>`,
          { headers: { "Content-Type": "text/html" }}
        );
      } else {  // Try Again
        return new Response(
          `<!DOCTYPE html><html><head>${getFrameHtml({
            buttons: [{ label: "Submit", action: "post" }],
            image: `${baseUrl}/images/preview.png`,
            version: "vNext",
            title: "Enter shipping address for your " + selectedCategory,
            inputText: "Your shipping address",
            state: `CATEGORY:${selectedCategory}`
          })}</head></html>`,
          { headers: { "Content-Type": "text/html" }}
        );
      }
    }
  } catch (error) {
    console.error('=== ERROR ===');
    console.error(error);
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