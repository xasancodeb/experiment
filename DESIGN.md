# Sway design guide

Every screen uses the same small set of sizes, colours and words. New screens should only use
what's listed here. The name is still a working title: once it's chosen, only the wordmark
and the words "Sway" change; the mark, colours and type stay.

## Brand

**Idea:** your people weigh in, and you get your answer.

**Mark:** "the circle": five friends in a ring around one lit-up choice, white on the brand
gradient (`brand/mark.svg`). It says "a private circle deciding together", and doesn't look like
a chat or to-do app. App icons are in the repo root (`icon-192.png`, `icon-512.png`,
`apple-touch-icon.png`, `favicon.png`), and the 1024px App Store icon is
`brand/app-store-icon-1024.png`. Don't add text to the icon or recolour the mark. The other
options that were considered are in `brand/logo-options.png`.

**Wordmark:** the name in lowercase, Plus Jakarta Sans ExtraBold (800), tight letter-spacing,
next to the mark.

**Brand gradient:** violet `#6D28D9` → pink `#DB2777` → burnt orange `#C2410C`, at 120°. Use it
for the one main action on a screen, the mark, and moments of celebration. Not for body text.

## Colour

| Role | Light | Dark |
|---|---|---|
| Background | `#F6F5FB` | `#0F0D18` |
| Surface (cards) | `#FFFFFF` | `#1A1727` |
| Sunken (inputs, chips) | `#F0EEF7` | `#242036` |
| Line | `#E7E3F1` | `#2E2944` |
| Text | `#17132B` | `#F6F4FF` |
| Secondary text | `#6B6683` | `#ADA7C6` |
| Accent (links, focus) | `#7C3AED` | `#A78BFA` |
| Danger | `#BE123C` on `#FFE4EA` | `#FB7185` on `#3A1622` |
| Success | `#047857` on `#DCFCEB` | `#6EE7B7` on `#10301F` |

**Question colours:** each question gets one of six gradients, picked from its id:
violet→pink, orange→pink, blue→violet, green→blue, red→amber, violet→teal. They're the deeper
shades of each hue so white text on them passes WCAG AA (at least 4.5:1). Never use the lighter
500-level shades behind white text.

**Contrast rule:** text must reach 4.5:1 against its background (3:1 for text 24px and up,
or 18.66px bold and up). Check new colour pairs before using them.

## Type

Plus Jakarta Sans, weights 600 (secondary), 700 (labels), 800 (titles, buttons, answers).

| Size | Use |
|---|---|
| 12px | Labels, pills, timestamps, small print |
| 14px | Secondary text, hints, chips, small buttons |
| 16px | Body text, list titles, inputs |
| 18px | Answers, big buttons, card subtitles |
| 22px | Section titles, sheet titles |
| 28px | Page titles, the question on a card |
| 36px | Landing headline, reveal headline |

Exceptions: initials inside small avatars (10–11px) and the reveal percentage (84px).

## Shape and space

- **Corners:** 8 (keys, thumbnails), 12 (small elements), 16 (inputs, small cards), 24 (cards),
  32 (hero cards), 999 (pills and buttons), 50% (avatars, circles).
- **Spacing:** multiples of 4: 4, 8, 12, 16, 20, 24. Screen edge: 16.
- **Touch targets:** at least 44×44 points.
- **Elevation:** one soft shadow for cards (`--lift`); the brand gradient's glow for the main
  button only.

## Layout and navigation

- **Signed out:** a website. Navigation bar, hero with the sign-up form, phone previews,
  how it works, examples, features, questions, a closing call to action, footer. Invite and
  question links skip the website and show a focused screen, so a friend can vote fast.
- **Signed in on a phone:** the app with the bottom tab bar. **On a computer (960px and up):** a
  sidebar with the same five places and an "Ask a question" button; content up to 680px wide.

- Five labelled tabs: Vote, Mine, Ask (centre, gradient), Circles, You. Every question,
  circle or form opens as its own page with a back arrow.
- One main action per screen. Secondary actions are ghost buttons or links.
- Nothing is chosen for the user when it matters (who to ask, private votes, offers).
- The tab bar hides while typing; text boxes always stay above the keyboard.

## Motion

Short and purposeful: pages slide 22px (0.24s), new cards deal in, a vote stamps the card,
the verdict breathes before it shows. Everything is off when the phone asks for reduced motion.

## Words

- Talk like a friend: short, warm, plain. "Your vote is in." not "Vote submitted
  successfully."
- Say what happened and what to do next, especially in errors: "That didn't save. Check your
  connection and try again."
- Name things the same everywhere: question, circle, vote, verdict, nudge.
- No jargon, no exclamation-mark hype.
