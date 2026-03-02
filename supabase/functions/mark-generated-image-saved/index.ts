import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";


serve(async (req) => {
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);
  }

  try {
    const { imageId, userId, createRecipe = true } = await req.json();

    if (!imageId || !userId) {
      return new Response(
        JSON.stringify({ error: 'imageId and userId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('💾 Marking image as saved:', { imageId, userId, createRecipe });

    // Create Supabase client with service role key (bypasses RLS)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // First, verify the user has access to this image
    // (either owns it or is a member of the organization that owns it)
    const { data: imageCheck, error: checkError } = await supabaseClient
      .from('generated_images')
      .select('*')
      .eq('id', imageId)
      .single();

    if (checkError || !imageCheck) {
      console.error('❌ Image not found:', checkError);
      return new Response(
        JSON.stringify({ error: 'Image not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user has access
    if (imageCheck.user_id !== userId) {
      // Check if user is a member of the organization
      const { data: membership, error: membershipError } = await supabaseClient
        .from('organization_members')
        .select('id')
        .eq('user_id', userId)
        .eq('organization_id', imageCheck.organization_id)
        .single();

      if (membershipError || !membership) {
        console.error('❌ User does not have access to this image');
        return new Response(
          JSON.stringify({ error: 'Access denied' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Update the image to mark as saved (using service role to bypass RLS)
    const { data: updatedImage, error: updateError } = await supabaseClient
      .from('generated_images')
      .update({ saved_to_library: true })
      .eq('id', imageId)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Failed to update image:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update image', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Also add to DAM (Digital Asset Management)
    try {
      console.log('📦 Adding image to DAM...');
      
      // Get the AI Generated smart folder or create the asset without a folder
      const { data: aiFolder } = await supabaseClient
        .from('dam_folders')
        .select('id')
        .eq('organization_id', imageCheck.organization_id)
        .eq('slug', 'ai-generated')
        .maybeSingle();
      
      // Generate a friendly name from the prompt
      const promptText = imageCheck.final_prompt || imageCheck.prompt || 'Generated Image';
      const assetName = promptText.length > 50 
        ? promptText.substring(0, 47) + '...' 
        : promptText;
      
      // Infer tags from goal_type
      const baseTags = ['ai-generated', 'image-studio'];
      const goalType = imageCheck.goal_type || 'product_photography';
      if (goalType) baseTags.push(goalType.replace('_', '-'));
      
      // Create DAM asset
      const { data: damAsset, error: damError } = await supabaseClient
        .from('dam_assets')
        .insert({
          organization_id: imageCheck.organization_id,
          folder_id: aiFolder?.id || null,
          name: assetName,
          file_type: 'image/png', // Generated images are PNG
          file_extension: 'png',
          file_url: imageCheck.image_url,
          thumbnail_url: imageCheck.thumbnail_url || imageCheck.image_url,
          source_type: 'generated',
          source_ref: {
            generated_image_id: imageId,
            session_id: imageCheck.session_id,
            prompt: promptText,
            model: imageCheck.model || 'freepik',
            aspect_ratio: imageCheck.aspect_ratio,
          },
          tags: baseTags,
          categories: ['ai-generated'],
          ai_analysis: {
            description: promptText,
            suggested_tags: baseTags,
            image_type: goalType,
          },
          status: 'active',
          uploaded_by: userId,
          metadata: {
            original_name: `generated-${imageId}.png`,
            aspect_ratio: imageCheck.aspect_ratio,
            output_format: imageCheck.output_format,
          },
        })
        .select()
        .single();
      
      if (damError) {
        console.error('❌ Failed to add to DAM:', damError);
        // Don't fail the whole request, just log it
      } else {
        console.log('✅ Image added to DAM:', damAsset?.id);
        
        // Log activity
        await supabaseClient
          .from('dam_activity_log')
          .insert({
            organization_id: imageCheck.organization_id,
            asset_id: damAsset?.id,
            action: 'upload',
            actor_type: 'system',
            actor_id: userId,
            actor_name: 'Image Studio',
            context: {
              source: 'image_studio',
              generated_image_id: imageId,
            },
          });
      }
    } catch (damErr) {
      console.error('❌ Error in DAM integration:', damErr);
      // Don't fail the whole request
    }

    // Automatically create recipe if requested
    if (createRecipe) {
      try {
        // Check if prompt already exists
        const { data: existingPrompt } = await supabaseClient
          .from('prompts')
          .select('id')
          .eq('generated_image_id', imageId)
          .maybeSingle();

        if (!existingPrompt) {
          console.log('📝 Creating recipe for saved image...');
          
          const promptText = imageCheck.final_prompt || imageCheck.prompt || "Generated Image";
          const goalType = imageCheck.goal_type || 'product_photography';
          
          // Infer category logic (mirrored from generate-madison-image)
          const categoryMap: Record<string, string> = {
            'product_photography': 'product',
            'lifestyle': 'lifestyle',
            'ecommerce': 'ecommerce',
            'social_media': 'social',
            'editorial': 'editorial',
            'creative': 'creative',
            'flat_lay': 'flat_lay',
          };

          let inferredCategory = categoryMap[goalType] || 'product';
          const promptLower = promptText.toLowerCase();
          
          if (!categoryMap[goalType]) {
            if (promptLower.includes('flat lay') || promptLower.includes('flatlay')) inferredCategory = 'flat_lay';
            else if (promptLower.includes('lifestyle')) inferredCategory = 'lifestyle';
            else if (promptLower.includes('ecommerce')) inferredCategory = 'ecommerce';
            else if (promptLower.includes('social')) inferredCategory = 'social';
            else if (promptLower.includes('editorial')) inferredCategory = 'editorial';
            else if (promptLower.includes('artistic')) inferredCategory = 'creative';
          }

          const recipeTitle = `Image Recipe - ${new Date().toLocaleDateString()}`;

          const { error: promptError } = await supabaseClient
            .from('prompts')
            .insert([{
              title: recipeTitle,
              prompt_text: promptText,
              content_type: 'visual',
              collection: 'General',
              organization_id: imageCheck.organization_id,
              created_by: userId,
              is_template: true,
              deliverable_format: 'image_prompt',
              generated_image_id: imageId,
              image_source: 'generated',
              category: inferredCategory,
              image_url: imageCheck.image_url, // Important: Store the image URL on the prompt
              additional_context: {
                aspect_ratio: imageCheck.aspect_ratio,
                output_format: imageCheck.output_format,
                image_type: goalType,
                category: inferredCategory,
                model: 'nano-banana',
                style: 'Photorealistic'
              }
            }]);

          if (promptError) {
            console.error('❌ Failed to create recipe:', promptError);
            // We don't fail the whole request, but we log it
          } else {
            console.log('✅ Recipe created successfully');
          }
        } else {
          console.log('ℹ️ Recipe already exists for this image');
        }
      } catch (recipeErr) {
        console.error('❌ Error in recipe creation logic:', recipeErr);
      }
    }

    console.log('✅ Image marked as saved:', imageId);

    return new Response(
      JSON.stringify({ success: true, image: updatedImage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error in mark-generated-image-saved:', errorMessage);
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
