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

// GET: Initial frame display
export async function GET(req: NextRequest) {
  // Initial frame showing category selection
  return new Response(
    `<!DOCTYPE html><html><head>${getFrameHtml({
      buttons: [
        { label: "🥩 Steak", action: "post" },
        { label: "🍷 Wine", action: "post" },
        { label: "🔪 Knife", action: "post" }
      ],
      image: `${baseUrl}/images/categories.png`,
      version: "vNext",
      title: "Select your free gift:"
    })}</head></html>`,
    { headers: { "Content-Type": "text/html" }}
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const frameMessage = await getFrameMessage(body);
    
    const userAddress = frameMessage.requesterVerifiedAddresses?.[0];
    const userName = frameMessage.requesterUserData?.displayName;

    if (!userAddress) {
      throw new Error('No verified address found');
    }

    // If no state, this is initial category selection
    if (!frameMessage.state) {
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
    if (frameMessage.state.startsWith('CATEGORY:')) {
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
    if (frameMessage.state.startsWith('CONFIRM:')) {
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
            image: `${baseUrl}/images/success.png`,
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