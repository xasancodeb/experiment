// Sway settings.
// Leave both values empty to run the demo (example friends, saved in the browser).
// To switch on real accounts, paste your Supabase project's URL and its public
// "anon" key here. The anon key is designed to be public; never put the
// "service_role" key in this file.
window.SWAY_CONFIG = {
  url: "https://tsxoecarlbekrgjxrjyu.supabase.co",
  key: "sb_publishable_NlokWgaBme8RQi5HDIowXQ_NCydn25C",
  // false = core only: ask, vote, reveal, comments, circles, notifications.
  // true also shows the extras (calling the winner, hot takes, nudges, tiebreaker, plans,
  // match mode, anonymous asking, awards, recap, streak).
  extras: true,
  // Public key for push notifications. Its private half lives only in the project's secrets.
  // Offers from places: false hides it. Turn on once businesses have signed up.
  offers: false,
  vapid: "BPg6FcHqY79WPp2YrSWOAEusgZtk2ZCnchvLYO2G2vp4Tp1_zx-BUKiPxO6dtVqaZxf481J3WJwb1w_xLdT3Pjc"
};
