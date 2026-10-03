-- 71b_theme_card_and_border_shades.sql
-- Gives every Colouring a card background (--bg-card) and two border shades
-- (--border-primary soft, --border-secondary strong), for light and dark.
-- Only those three keys change; every other token is left alone.
-- Re-runnable: running it again writes the same values.

-- STEP 1 - read-only: what each Colouring has now.
SELECT id, name,
       JSON_UNQUOTE(JSON_EXTRACT(light_tokens, '$."--bg-card"'))        AS light_card_now,
       JSON_UNQUOTE(JSON_EXTRACT(light_tokens, '$."--border-primary"'))  AS light_border_now,
       JSON_UNQUOTE(JSON_EXTRACT(dark_tokens,  '$."--bg-card"'))        AS dark_card_now,
       JSON_UNQUOTE(JSON_EXTRACT(dark_tokens,  '$."--border-primary"'))  AS dark_border_now
FROM colourings ORDER BY id;

-- STEP 2 - write the shades.
-- Light card = the page colour lifted 70% towards white.
-- Dark card  = the page colour lifted 7% towards the text colour.
-- Borders    = the card tinted with the accent colour (soft ~20-24%, strong ~38-42%).

-- Default
UPDATE colourings SET
  light_tokens = JSON_SET(light_tokens, '$."--bg-card"', '#ffffff', '$."--border-primary"', '#eeddfd', '$."--border-secondary"', '#debefc'),
  dark_tokens  = JSON_SET(dark_tokens,  '$."--bg-card"', '#1f1b2a', '$."--border-primary"', '#40295b', '$."--border-secondary"', '#593380')
WHERE id = 1;
-- Nord
UPDATE colourings SET
  light_tokens = JSON_SET(light_tokens, '$."--bg-card"', '#f9fafc', '$."--border-primary"', '#d6e0eb', '$."--border-secondary"', '#b7c9dc'),
  dark_tokens  = JSON_SET(dark_tokens,  '$."--bg-card"', '#3b414d', '$."--border-primary"', '#4d5f6c', '$."--border-secondary"', '#5b7684')
WHERE id = 2;
-- Rose Pine
UPDATE colourings SET
  light_tokens = JSON_SET(light_tokens, '$."--bg-card"', '#fefcfa', '$."--border-primary"', '#f6d9e2', '$."--border-secondary"', '#eeb9cc'),
  dark_tokens  = JSON_SET(dark_tokens,  '$."--bg-card"', '#281f2f', '$."--border-primary"', '#512a42', '$."--border-secondary"', '#703151')
WHERE id = 3;
-- Arctic Tide
UPDATE colourings SET
  light_tokens = JSON_SET(light_tokens, '$."--bg-card"', '#fdffff', '$."--border-primary"', '#cef1ed', '$."--border-secondary"', '#a4e4dd'),
  dark_tokens  = JSON_SET(dark_tokens,  '$."--bg-card"', '#172c2f', '$."--border-primary"', '#164e4c', '$."--border-secondary"', '#166761')
WHERE id = 4;
-- Candy
UPDATE colourings SET
  light_tokens = JSON_SET(light_tokens, '$."--bg-card"', '#fffcfe', '$."--border-primary"', '#fcd3ea', '$."--border-secondary"', '#f9add8'),
  dark_tokens  = JSON_SET(dark_tokens,  '$."--bg-card"', '#2a1125', '$."--border-primary"', '#5a1841', '$."--border-secondary"', '#7d1d56')
WHERE id = 5;
-- Golem Workshop
UPDATE colourings SET
  light_tokens = JSON_SET(light_tokens, '$."--bg-card"', '#fefdfa', '$."--border-primary"', '#fceaca', '$."--border-secondary"', '#fbd99f'),
  dark_tokens  = JSON_SET(dark_tokens,  '$."--bg-card"', '#201b11', '$."--border-primary"', '#533a10', '$."--border-secondary"', '#79520e')
WHERE id = 6;
-- Solarized
UPDATE colourings SET
  light_tokens = JSON_SET(light_tokens, '$."--bg-card"', '#fefcf7', '$."--border-primary"', '#ebe2c6', '$."--border-secondary"', '#daca99'),
  dark_tokens  = JSON_SET(dark_tokens,  '$."--bg-card"', '#123942', '$."--border-primary"', '#394c32', '$."--border-secondary"', '#565b26')
WHERE id = 7;
-- Citrus Paper
UPDATE colourings SET
  light_tokens = JSON_SET(light_tokens, '$."--bg-card"', '#fffefd', '$."--border-primary"', '#fee2cf', '$."--border-secondary"', '#fdc9a5'),
  dark_tokens  = JSON_SET(dark_tokens,  '$."--bg-card"', '#1b1911', '$."--border-primary"', '#502f12', '$."--border-secondary"', '#783f13')
WHERE id = 8;
-- Dracula
UPDATE colourings SET
  light_tokens = JSON_SET(light_tokens, '$."--bg-card"', '#fdfdfb', '$."--border-primary"', '#f0e8fb', '$."--border-secondary"', '#e5d5fa'),
  dark_tokens  = JSON_SET(dark_tokens,  '$."--bg-card"', '#373843', '$."--border-primary"', '#574e6f', '$."--border-secondary"', '#6f5e8f')
WHERE id = 10;
-- Quantum Orchard
UPDATE colourings SET
  light_tokens = JSON_SET(light_tokens, '$."--bg-card"', '#fcfffb', '$."--border-primary"', '#e4f5cd', '$."--border-secondary"', '#ceeca4'),
  dark_tokens  = JSON_SET(dark_tokens,  '$."--bg-card"', '#141e0c', '$."--border-primary"', '#364e16', '$."--border-secondary"', '#50721d')
WHERE id = 11;
-- Lavender Terminal
UPDATE colourings SET
  light_tokens = JSON_SET(light_tokens, '$."--bg-card"', '#fefdff', '$."--border-primary"', '#dfdffc', '$."--border-secondary"', '#c3c4fa'),
  dark_tokens  = JSON_SET(dark_tokens,  '$."--bg-card"', '#1c1a2e', '$."--border-primary"', '#34355e', '$."--border-secondary"', '#464a83')
WHERE id = 12;
-- Red
UPDATE colourings SET
  light_tokens = JSON_SET(light_tokens, '$."--bg-card"', '#fffcfc', '$."--border-primary"', '#fdd6dc', '$."--border-secondary"', '#fbb4c0'),
  dark_tokens  = JSON_SET(dark_tokens,  '$."--bg-card"', '#200f14', '$."--border-primary"', '#55272f', '$."--border-secondary"', '#7c3843')
WHERE id = 13;
-- Sunlit Atelier
UPDATE colourings SET
  light_tokens = JSON_SET(light_tokens, '$."--bg-card"', '#fffef9', '$."--border-primary"', '#fdebc9', '$."--border-secondary"', '#fbda9f'),
  dark_tokens  = JSON_SET(dark_tokens,  '$."--bg-card"', '#201a0e', '$."--border-primary"', '#554213', '$."--border-secondary"', '#7c5f17')
WHERE id = 14;
-- Iris Bloom
UPDATE colourings SET
  light_tokens = JSON_SET(light_tokens, '$."--bg-card"', '#fefdff', '$."--border-primary"', '#eddbfd', '$."--border-secondary"', '#ddbdfc'),
  dark_tokens  = JSON_SET(dark_tokens,  '$."--bg-card"', '#1d1728', '$."--border-primary"', '#44315b', '$."--border-secondary"', '#614581')
WHERE id = 15;
-- Apricot Soda
UPDATE colourings SET
  light_tokens = JSON_SET(light_tokens, '$."--bg-card"', '#fffdfa', '$."--border-primary"', '#fee1cc', '$."--border-secondary"', '#fdc9a3'),
  dark_tokens  = JSON_SET(dark_tokens,  '$."--bg-card"', '#21150f', '$."--border-primary"', '#55331a', '$."--border-secondary"', '#7d4a22')
WHERE id = 16;
-- Mint Blueprint
UPDATE colourings SET
  light_tokens = JSON_SET(light_tokens, '$."--bg-card"', '#fafefd', '$."--border-primary"', '#ccf0ec', '$."--border-secondary"', '#a3e3dc'),
  dark_tokens  = JSON_SET(dark_tokens,  '$."--bg-card"', '#0f201e', '$."--border-primary"', '#164b45', '$."--border-secondary"', '#1c6c62')
WHERE id = 17;
-- Midnight Cobalt
UPDATE colourings SET
  light_tokens = JSON_SET(light_tokens, '$."--bg-card"', '#fafcff', '$."--border-primary"', '#d4e4fd', '$."--border-secondary"', '#b1cefc'),
  dark_tokens  = JSON_SET(dark_tokens,  '$."--bg-card"', '#0f1220', '$."--border-primary"', '#223554', '$."--border-secondary"', '#31507c')
WHERE id = 18;
-- Ultraviolet Glass
UPDATE colourings SET
  light_tokens = JSON_SET(light_tokens, '$."--bg-card"', '#fefeff', '$."--border-primary"', '#eccbff', '$."--border-secondary"', '#dc9dff'),
  dark_tokens  = JSON_SET(dark_tokens,  '$."--bg-card"', '#170f21', '$."--border-primary"', '#3f1b56', '$."--border-secondary"', '#5e247e')
WHERE id = 19;

-- STEP 3 - result check: all six colour columns should be filled in for every row (none NULL).
SELECT id, name,
       JSON_UNQUOTE(JSON_EXTRACT(light_tokens, '$."--bg-card"'))         AS light_card,
       JSON_UNQUOTE(JSON_EXTRACT(light_tokens, '$."--border-primary"'))   AS light_border,
       JSON_UNQUOTE(JSON_EXTRACT(light_tokens, '$."--border-secondary"')) AS light_border_strong,
       JSON_UNQUOTE(JSON_EXTRACT(dark_tokens,  '$."--bg-card"'))         AS dark_card,
       JSON_UNQUOTE(JSON_EXTRACT(dark_tokens,  '$."--border-primary"'))   AS dark_border,
       JSON_UNQUOTE(JSON_EXTRACT(dark_tokens,  '$."--border-secondary"')) AS dark_border_strong
FROM colourings ORDER BY id;
