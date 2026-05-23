# Best Bottles visual identity resolver

Important clarification:
This is not only for Diva. This applies across the full Best Bottles product database.

Madison should not validate every image against one generic field like capColor or glass color. It needs to resolve the correct visual identity field based on product/applicator/component type.

Global Best Bottles visual validation rules:

1. Glass bottle color
Use when the variant is primarily a bottle/glass color difference:
- Clear
- Amber
- Cobalt Blue
- Frosted
- Black
- White
- etc.

2. Perfume spray / fine mist spray
Use spray/cap finish:
- Shiny Gold
- Matte Gold
- Shiny Silver
- Matte Silver
- Shiny Black
- Copper
- White
- Black

3. Reducer / screw cap / closure
Use cap/closure finish:
- Shiny Gold
- Matte Gold
- Shiny Silver
- Matte Silver
- Shiny Black
- White
- Leather finishes
- Tall cap vs short cap where applicable

4. Roll-on / metal roll-on
Use cap finish and roller type:
- Shiny Black
- Shiny Gold
- Matte Silver
- Silver dots
- Black dots
- Metal roller
- Plastic roller

5. Vintage / antique bulb sprayer
Use bulb/sprayer color as the primary visual identity:
- Black
- Gold
- Matte Silver
- White
- Red
- Pink
- Lavender
- Ivory
Also preserve secondary attributes:
- Collar finish
- Tassel
- Ring
- Jeweled ring

6. Lotion pump / treatment pump
Use pump/collar/overcap color:
- Black
- White
- Clear overcap
- Matte Silver
- Shiny Gold
- etc.

7. Droppers
Use bulb/cap finish:
- Black
- White
- Gold
- Silver
- Ribbed cap if applicable

8. Jars
Use lid/cap finish and jar color:
- Amber jar
- Clear jar
- White cap
- Silver cap
- Black cap

Resolver priority:
Madison should derive visual identity from:
1. Explicit product intelligence fields, if available
2. Applicator/component type
3. Grace SKU tokens
4. Website SKU tokens
5. Item name text
6. Existing tags/metadata

The validator should compare "Image finish shown" against the resolved visual identity, not blindly against capColor or glass color.

Example:
If a variant is a clear glass bottle with a lavender antique bulb sprayer, the correct visual identity is Lavender, not Clear.

Goal:
Prevent false mismatch warnings and prevent accidental Shopify variant overwrites across the entire Best Bottles catalog.
