# Taste: research, risks, and how the prototype handles them

Research done October 2026. **This is not legal advice.** Have a lawyer review the
earnings program and terms before launch.

## The idea in one line

A social app where everyday people share honest recommendations (love it / it's fine /
skip it). When someone buys through a labeled paid link, the person who recommended it
gets 70% of the store's commission and Taste keeps 30%.

## What already exists

| Who | What they do | What it means for us |
|---|---|---|
| **LTK** | Shopping app for influencers. 1M+ brands, ~44M monthly shoppers, typically 10–25% commission. Closed network. | Big and proven, but built for influencers, not regular people. |
| **ShopMy** | Open creator storefronts, ~175K creators and 50K brands, 10–30% commissions. | The fast-growing challenger. Also influencer-focused. |
| **Amazon Influencer Program** | Creator storefronts on Amazon. | Strong for creators, but only Amazon products. |
| **Beli** | Friends rank restaurants. Grew through friend invites, TikTok, leaderboards, streaks and campus competitions. | Proof that "friends' taste" spreads. **The growth playbook to copy.** |
| **Refer A Friend App** (Dec 2025) | Pays people for referring local businesses. | Shows demand for paying everyday people. Small so far. |

**The gap:** everyday people with good taste and no influencer audience. Nobody is
building for them with honesty as the core promise.

## The 6 biggest risks, and what we did about each

### 1. Looking like a scam ("spam your friends, earn money")
A 2011 TechCrunch headline about a similar app, Shopcade, read *"Spam Friends, Earn
Money."* That's the reputation to avoid.

**In the prototype:**
- The pitch is **honesty first, money second.** The landing page leads with "What would
  your most honest friend buy?", and earning is a small "thank you", not the headline.
- Everyone takes the **Taste pledge** at signup: only recommend what you've used, be
  honest, be kind.
- New members **can't earn at all** until they've built trust (see #3).
- A public **"How we keep Taste honest"** page explains every rule in plain English.

### 2. Breaking FTC rules
- **Fake reviews rule (effective Oct 2024):** you can't pay for reviews of a particular
  sentiment, or post reviews from people with no real experience. Penalties run up to
  ~$51,744 per violation.
- **Endorsement Guides (2023):** affiliate links must be clearly disclosed right next to
  the link. "Paid link" counts as clear; "affiliate link" alone, a "buy now" button, or
  a disclosure hidden in a bio does not.

**In the prototype:**
- Every paid link shows **"Paid link · @name may earn a commission if you buy"** directly
  beside it. Members can't turn it off.
- **"Skip it" posts rank exactly the same** as "Love it" posts. Ranking never looks at
  verdicts, paid links or earnings. A test proves this.
- The guidelines ban AI-written and second-hand reviews and require disclosing ties to a
  brand. AI moderation flags posts that read like ads or AI text.

### 3. Spam and fake accounts
Any app that pays attracts cheaters. The strategy: **make cheating not worth it.**

**In the prototype:**
- **Trust levels.** New members get 3 posts a day, regular (unpaid) links only, and
  don't appear in Discover. Members (7+ days, 3+ posts, helpful votes from 5 different
  people) unlock paid links. Trusted members (30+ days, 20+ helpers, no removed posts)
  get the highest limits.
- **One person, one account.** Phone verification is required to post, and identity
  verification is required to get paid.
- **Every post is checked.** Rules catch ad phrases, ALL CAPS, emails and phone
  numbers, links pasted into the text, and copy-pasted posts. An AI review runs too when
  an API key is set. The stricter result always wins.
- **Link safety.** No short links, which hide where they go. HTTPS only. Other people's
  tracking codes are stripped so nobody can hijack a recommendation.
- **Reports.** A real person reviews every report. Three reports from established
  members hide a post automatically until it's reviewed.
- **Money protections.** Earnings are held 45 days, clicking your own link earns
  nothing, duplicate sale notices are ignored, and removed posts or banned accounts
  **lose all unpaid earnings.**

### 4. Store rules: Amazon is off-limits
Amazon's Associates agreement forbids giving anyone "any consideration, reward, or
incentive" for using affiliate links, and bans rebate-style sites.

**In the prototype:** Amazon links still work as normal links but are **never** paid
links. Paid links only come from a partner-store list. Before launch, get written
approval from networks (Impact, Rakuten, CJ, Awin) or brands that allow a platform to
share commission with its members, like ShopMy does. Skimlinks-type services approve
only ~3% of applicants, so don't count on them early.

### 5. Thin money per sale
Commissions are usually 5–15%, higher in beauty and fashion. A $50 purchase at 8% is
$4, so the member gets $2.80 and Taste gets $1.20.
- **Start in high-commission categories**, such as beauty and skincare, then home.
- Taste's revenue only becomes large at scale. Plan for a **long runway** or outside
  investment.

### 6. Shopping apps fade
Polyvore had 20 million monthly users and still shut down in 2018. Research on
Wanelo and Fancy suggests shopping should feel *secondary* to the social part.

**In the prototype:** the app is about **people and honesty first.** You follow people,
mark posts "helpful", and say "I tried it too: agree or disagree." The money is a side
benefit.

## Launch plan

1. **Pick one niche:** skincare for sensitive skin. It has high commissions, passionate
   people, and lots of bad products to warn about.
2. **Hand-pick 50–100 founding members** with real taste. Make them feel special with a
   "Founding member" badge.
3. **Copy Beli's growth tricks:** friend invites, weekly "most helpful" leaderboards,
   and campus or city competitions.
4. **Short videos** on TikTok and Reels: "Things our members told everyone to SKIP."
   Honest negatives get attention and build trust.
5. **Grow category by category** once the first one is lively.

## Still needed before a real public launch

- [ ] A lawyer to review the terms, earnings program, FTC compliance and tax handling
- [ ] Affiliate network or brand approvals for commission sharing
- [ ] Real phone verification, e.g. Twilio Verify (currently a demo button)
- [ ] Real identity checks and payouts through Stripe Connect, which handles tax forms
      (currently a demo button)
- [ ] A real database (Postgres) in place of the JSON file
- [ ] Photo uploads with image moderation
- [ ] Email password reset, account deletion and data export
- [ ] A privacy policy and terms of service
- [ ] Mobile apps, after the web version proves people love it

## Sources

- [LTK vs ShopMy (2026)](https://stackinfluence.com/shopmy-vs-ltk-best-affiliate-platform-2026/)
- [ShopMy vs LTK commission ranges](https://gillian-sarah.com/shopmy-vs-ltk-2026/)
- [Influencer apps in 2026](https://nealschaffer.com/influencer-apps/)
- [Refer A Friend App launch](https://finance.yahoo.com/news/refer-friend-app-app-pays-140000198.html)
- [Shopcade: "Spam Friends, Earn Money" (TechCrunch, 2011)](https://techcrunch.com/2011/11/22/shopcade)
- [FTC final rule banning fake reviews](https://www.goodwinlaw.com/en/insights/publications/2024/09/alerts-practices-cldr-ftc-finalizes-rule-on-consumer-reviews)
- [FTC fake review rule: penalties](https://www.nutraingredients.com/Article/2024/08/16/ftc-announces-final-rule-banning-fake-reviews-and-testimonials)
- [FTC Endorsement Guides 2023: key takeaways](https://infolawgroup.com/insights/2023/7/31/ftc-releases-updated-endorsement-guides-10-key-takeaways)
- [Endorsement Guides in depth](https://www.mondaq.com/unitedstates/consumer-law/1349688/an-in-depth-look-at-the-ftcs-updates-to-the-endorsement-guidespart-2-of-2)
- [Amazon Associates: incentive prohibition](https://conductatlas.com/platform/amazon-associates/amazon-associates-program-policies/incentivized-clicks-and-purchases-prohibition/)
- [Skimlinks approvals process](https://skimlinks.com/?p=12208)
- [How Beli grew (Demand Curve)](https://www.demandcurve.com/newsletters/growth-newsletter-285)
- [Beli and dining out (Taste Cooking)](https://tastecooking.com/beli-invites-the-loneliest-generation-to-dine-out/)
- [What happened to Polyvore](https://productmint.com/what-happened-to-polyvore/)
- [Wanelo and social commerce (MediaPost)](https://www.mediapost.com/publications/article/229239/how-social-site-wanelo-wins-m-commerce-converts.html)
