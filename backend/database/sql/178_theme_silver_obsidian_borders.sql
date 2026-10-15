-- 178_theme_silver_obsidian_borders.sql
-- Silver Mist (id 20) and Obsidian (id 21) were added after script 71b gave every Colouring its card colour and two border shades,
-- so they have no --border-primary / --border-secondary: cards, tables and inputs lose their edges. This gives them both, light and dark.
-- Only those two keys (and --bg-card, unchanged in value) are written; every other token is left alone. Re-runnable: running it again writes the same values.
-- Run each part on its own in Workbench.

-- PART A - READ-ONLY: the border keys each of the last two Colourings has now (NULL = missing), next to Nord for comparison.
SELECT id, name,
       JSON_UNQUOTE(JSON_EXTRACT(light_tokens, '$."--border-primary"'))   AS light_border_soft,
       JSON_UNQUOTE(JSON_EXTRACT(light_tokens, '$."--border-secondary"')) AS light_border_strong,
       JSON_UNQUOTE(JSON_EXTRACT(dark_tokens,  '$."--border-primary"'))   AS dark_border_soft,
       JSON_UNQUOTE(JSON_EXTRACT(dark_tokens,  '$."--border-secondary"')) AS dark_border_strong
FROM colourings WHERE id IN (2, 20, 21) ORDER BY id;

-- PART B - WRITE. Borders = the card colour tinted with the accent: soft 20%, strong 40% (the same rule as 71b).
-- Silver Mist: light card #FFFFFF with #525252, dark card #262626 with #D4D4D4
UPDATE colourings SET
  light_tokens = JSON_SET(light_tokens, '$."--border-primary"', '#dcdcdc', '$."--border-secondary"', '#bababa'),
  dark_tokens  = JSON_SET(dark_tokens,  '$."--border-primary"', '#494949', '$."--border-secondary"', '#6c6c6c')
WHERE id = 20;
-- Obsidian: light card #FFFFFF with #1F2937, dark card #202023 with #D4D4D8
UPDATE colourings SET
  light_tokens = JSON_SET(light_tokens, '$."--border-primary"', '#d2d4d7', '$."--border-secondary"', '#a5a9af'),
  dark_tokens  = JSON_SET(dark_tokens,  '$."--border-primary"', '#444447', '$."--border-secondary"', '#68686b')
WHERE id = 21;

-- PART C - CHECK AFTER (all four columns should now have a value for ids 20 and 21)
SELECT id, name,
       JSON_UNQUOTE(JSON_EXTRACT(light_tokens, '$."--border-primary"'))   AS light_border_soft,
       JSON_UNQUOTE(JSON_EXTRACT(light_tokens, '$."--border-secondary"')) AS light_border_strong,
       JSON_UNQUOTE(JSON_EXTRACT(dark_tokens,  '$."--border-primary"'))   AS dark_border_soft,
       JSON_UNQUOTE(JSON_EXTRACT(dark_tokens,  '$."--border-secondary"')) AS dark_border_strong
FROM colourings WHERE id IN (2, 20, 21) ORDER BY id;
