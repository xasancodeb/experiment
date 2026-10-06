// Demo content so the prototype feels alive on first run.
// Disable with SEED_DEMO=0. Never run this against a real database.
import { data, hashPassword, newId, notify, save, type Post, type User } from "./store.js";
import { HOLD_DAYS, USER_SHARE } from "./trust.js";

const DAY = 24 * 3600 * 1000;
const ago = (days: number, hours = 0) => new Date(Date.now() - days * DAY - hours * 3600000).toISOString();

type P = [title: string, category: string, verdict: Post["verdict"], buyAgain: boolean, body: string, price?: string, url?: string, merchant?: string];

export function seedIfEmpty(): void {
  if (process.env.SEED_DEMO === "0" || data.users.length > 0) return;

  const mk = (handle: string, name: string, days: number, bio: string, extra: Partial<User> = {}): User => {
    const u: User = {
      id: newId(), handle, name, email: `${handle}@taste.demo`, passwordHash: "", bio, interests: [],
      role: "member", phoneVerified: true, idVerified: false, banned: false, createdAt: ago(days),
      pledgeAcceptedAt: ago(days), foundingMember: true, ...extra,
    };
    data.users.push(u);
    return u;
  };

  const demoHash = hashPassword("demo1234");
  const maya = mk("maya", "Maya Okafor", 80, "Sensitive skin, small budget, big opinions");
  const rosa = mk("rosa_eats", "Rosa Delgado", 45, "Home cook. I'll tell you if it's worth it.");
  const dev = mk("devtech", "Dev Patel", 30, "Gadgets that actually last");
  const sam = mk("sam_home", "Sam Lee", 25, "Small apartment, big plans");
  const lena = mk("lena", "Lena Novak", 2, "");
  const you = mk("jordan", "Jordan Rivera", 60, "Runner, reader, recovering impulse buyer", { email: "demo@taste.demo" });
  const admin = mk("taste_team", "Taste Team", 90, "Keeping Taste honest", { role: "admin", email: "admin@taste.demo" });
  for (const u of [maya, rosa, dev, sam, lena, you]) u.passwordHash = demoHash;
  admin.passwordHash = hashPassword("admin1234");

  const crowdHash = hashPassword(newId());
  const crowd = Array.from({ length: 24 }, (_, i) => {
    const u = mk(`member${i + 1}`, `Member ${i + 1}`, 20 + i, "");
    u.passwordHash = crowdHash;
    return u;
  });

  const add = (author: User, days: number, p: P, opts: { paid?: boolean; status?: Post["status"]; reasons?: string[] } = {}) => {
    const post: Post = {
      id: newId(), authorId: author.id, title: p[0], category: p[1], verdict: p[2], buyAgain: p[3], body: p[4],
      price: p[5], url: p[6], merchant: p[7], paidLink: Boolean(opts.paid && p[6]), status: opts.status ?? "live",
      moderation: { source: "rules", reasons: opts.reasons ?? [] }, createdAt: ago(days, Math.floor(Math.random() * 20)),
    };
    data.posts.push(post);
    return post;
  };
  const helpful = (post: Post, n: number, from = crowd) => {
    from.slice(0, n).forEach((u, i) => data.helpful.push({ postId: post.id, userId: u.id, createdAt: ago(i % 12, i) }));
  };
  const tried = (post: Post, agree: number, disagree: number) => {
    crowd.slice(10, 10 + agree).forEach((u) => data.tried.push({ postId: post.id, userId: u.id, agree: true }));
    crowd.slice(10 + agree, 10 + agree + disagree).forEach((u) => data.tried.push({ postId: post.id, userId: u.id, agree: false }));
  };

  const mayaPosts: P[] = [
    ["CeraVe Moisturizing Cream", "Beauty", "love", true, "The only moisturizer that hasn't made my sensitive skin angry. Thick, no smell, and the big tub lasts me about four months. If you have oily skin it might feel heavy.", "$17", "https://www.target.com/s/cerave+moisturizing+cream", "Target"],
    ["Viral 'glass skin' serum", "Beauty", "skip", false, "Everyone on my feed loved it, so I tried it for three weeks. Sticky, pilled under sunscreen, and did nothing my $8 serum doesn't. Save your money.", "$38"],
    ["La Roche-Posay Anthelios SPF 50", "Beauty", "love", true, "Finally a sunscreen that doesn't sting my eyes or leave me ghost-white. Pricey but I use it every single day.", "$37", "https://www.ulta.com/p/anthelios-melt-in-milk-sunscreen", "Ulta Beauty"],
    ["Drugstore micellar water", "Beauty", "fine", true, "Does the job for light makeup. Struggles with waterproof mascara. Fine for the price, nothing special.", "$9"],
    ["Satin pillowcase", "Home", "love", true, "Less frizz, fewer creases on my face in the morning. Cheap upgrade that actually worked for me.", "$12"],
    ["The Ordinary Niacinamide", "Beauty", "fine", false, "Helped my oil a little but broke me out the first week. Worth trying if your skin isn't super sensitive.", "$6"],
    ["Silicone makeup sponge", "Beauty", "skip", false, "Gimmick. Moves foundation around instead of blending it. Went back to a regular sponge after two days.", "$10"],
    ["Bookshop.org gift card", "Books & Media", "love", true, "My go-to gift. It supports local bookstores and nobody has ever been disappointed by it.", "$25", "https://bookshop.org/gift-cards", "Bookshop.org"],
    ["Vanicream Gentle Cleanser", "Beauty", "love", true, "Boring in the best way. No fragrance, no tightness after washing. A safe bet for reactive skin.", "$11", "https://www.target.com/s/vanicream+cleanser", "Target"],
    ["Overnight lip mask", "Beauty", "fine", true, "Nice, smells good, but plain petroleum jelly does 90% of the same thing for a tenth of the price.", "$24"],
  ];
  mayaPosts.forEach((p, i) => {
    const post = add(maya, 2 + i * 6, p, { paid: true });
    helpful(post, 22 - i);
    tried(post, 3 + (i % 3), i % 2);
  });

  const rosaPosts: P[] = [
    ["Lodge 10-inch cast iron skillet", "Food & Drink", "love", true, "Bought it four years ago for $25 and use it daily. Gets better with age. Heavy, so not for everyone.", "$25", "https://www.target.com/s/lodge+cast+iron+skillet", "Target"],
    ["Fancy 12-in-1 air fryer", "Food & Drink", "skip", false, "Too many buttons, a basket that's a pain to clean, and it died after 14 months. A basic two-dial model is better.", "$149"],
    ["Rao's marinara", "Food & Drink", "love", true, "Tastes like slow-cooked sauce. Expensive for a jar, but I keep two in the pantry for tired nights.", "$9"],
    ["Meal kit subscription", "Food & Drink", "fine", false, "Great for learning a few recipes. Too much packaging and too pricey to keep long-term.", "$60/week"],
  ];
  rosaPosts.forEach((p, i) => {
    const post = add(rosa, 1 + i * 8, p, { paid: true });
    helpful(post, 9 - i, crowd.slice(5));
    tried(post, 2, i === 1 ? 0 : 1);
  });

  const devPosts: P[] = [
    ["Anker 20,000mAh power bank", "Tech", "love", true, "Charges my phone 4 times. Two years of daily commuting and it still holds up. Heavier than the slim ones.", "$45", "https://www.bestbuy.com/site/searchpage.jsp?st=anker+power+bank", "Best Buy"],
    ["Cheap wireless earbuds from an ad", "Tech", "skip", false, "Bluetooth kept dropping and the case stopped charging after a month. Stick to known brands.", "$19"],
    ["Kindle Paperwhite", "Books & Media", "love", true, "Read in bed without a lamp, battery lasts weeks. Made me read three times more this year.", "$150"],
  ];
  devPosts.forEach((p, i) => helpful(add(dev, 3 + i * 7, p, { paid: true }), 7, crowd.slice(2)));

  const samPosts: P[] = [
    ["IKEA KALLAX shelf", "Home", "fine", true, "Sturdy and cheap, but assembly took 2 hours and it's everywhere. Good storage, zero personality.", "$70"],
    ["Wayfair floor lamp", "Home", "skip", false, "Looked great in photos, wobbled out of the box and the shade arrived dented. Returned it.", "$89", "https://www.wayfair.com/lighting/sb0/floor-lamps-c215704.html", "Wayfair"],
    ["Adjustable dumbbells", "Fitness", "love", true, "Replaced a whole rack in my tiny apartment. Clicks between weights in seconds. Worth every dollar.", "$299", "https://www.rei.com/search?q=adjustable+dumbbells", "REI"],
  ];
  samPosts.forEach((p, i) => helpful(add(sam, 2 + i * 6, p, { paid: true }), 6, crowd.slice(8)));

  add(lena, 0, ["Great earbuds", "Tech", "love", true, "BEST EARBUDS EVER!!!!! DM me for a discount code, limited time only, buy now before they sell out", "$29"], {
    status: "held",
    reasons: ['Sounds like an ad ("dm me"). A moderator will take a look.', "Lots of capital letters. A moderator will take a look."],
  });

  const yourPosts: P[] = [
    ["Brooks Ghost running shoes", "Fitness", "love", true, "My third pair. Comfortable from the first run, no blisters, last about 400 miles. Run a half size big.", "$140", "https://www.rei.com/search?q=brooks+ghost", "REI"],
    ["Project Hail Mary", "Books & Media", "love", true, "Couldn't put it down. Funny, smart, and the friendship at its heart got me. Great audiobook too.", "$18", "https://bookshop.org/search?keywords=project+hail+mary", "Bookshop.org"],
    ["Budget fitness tracker", "Tech", "skip", false, "Step count was off by thousands and the app wanted a subscription for basic charts. Not worth it.", "$35"],
  ];
  const mine = yourPosts.map((p, i) => {
    const post = add(you, 4 + i * 12, p, { paid: true });
    helpful(post, 6, crowd.slice(12));
    return post;
  });

  // Some sample earnings for the demo account: two released, two still on hold.
  [[50, 180.0], [48, 260.0], [10, 140.0], [3, 18.0]].forEach(([days, order]) => {
    const post = order === 18 ? mine[1] : mine[0];
    const click = { id: newId(), postId: post.id, userId: crowd[0].id, selfClick: false, createdAt: ago(days) };
    data.clicks.push(click);
    const commission = Math.round(order * 0.08 * 100) / 100;
    const created = Date.now() - days * DAY;
    data.earnings.push({
      id: newId(), userId: you.id, postId: post.id, clickId: click.id, orderAmount: order, commission,
      userShare: Math.round(commission * USER_SHARE * 100) / 100, status: "pending",
      createdAt: new Date(created).toISOString(), availableAt: new Date(created + HOLD_DAYS * DAY).toISOString(),
    });
  });

  const byTitle = (t: string) => data.posts.find((p) => p.title === t)!.id;
  data.lists.push(
    {
      id: newId(), ownerId: maya.id, title: "Sensitive-skin starter kit", createdAt: ago(20),
      description: "Everything that hasn't made my reactive skin angry. Start here.",
      postIds: [byTitle("Vanicream Gentle Cleanser"), byTitle("CeraVe Moisturizing Cream"), byTitle("La Roche-Posay Anthelios SPF 50")],
    },
    {
      id: newId(), ownerId: you.id, title: "Running gear that lasted", createdAt: ago(9),
      description: "Stuff I'd buy again after hundreds of miles.", postIds: [mine[0].id],
    },
  );
  notify(you.id, "follow", "Member 3 (@member3) started following you.", "/u/member3");
  notify(you.id, "helpful", `Maya Okafor found your review of "Project Hail Mary" helpful.`, `/p/${mine[1].id}`);
  notify(you.id, "tried", `Member 14 tried "Brooks Ghost running shoes" too and agrees with you.`, `/p/${mine[0].id}`);

  for (const f of [maya, rosa, dev]) data.follows.push({ followerId: you.id, followeeId: f.id });
  for (const u of crowd.slice(0, 15)) data.follows.push({ followerId: u.id, followeeId: maya.id });
  for (const u of crowd.slice(0, 6)) data.follows.push({ followerId: u.id, followeeId: you.id });

  const reported = data.posts.find((p) => p.authorId === dev.id && p.verdict === "skip")!;
  data.reports.push({ id: newId(), postId: reported.id, reporterId: crowd[20].id, reason: "Mean, hateful or harassing", status: "open", createdAt: ago(0, 3) });

  save();
  console.log("Seeded demo data. Log in as demo@taste.demo / demo1234 (admin: admin@taste.demo / admin1234)");
}
