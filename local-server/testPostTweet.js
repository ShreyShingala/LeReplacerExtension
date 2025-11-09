const { postTweet, getAuthStatus } = require('./twitterClient');

async function run() {
  try {
    console.log('Auth status:', getAuthStatus());
    const res = await postTweet('LEBRONNNNNNN IMMA BE LIKE YEAAAAAAA TO YOU BOI');
    console.log('Post success:', res);
  } catch (err) {
    console.error('Post failed:', err && err.message ? err.message : err);
    console.error(err);
  }
}

run();
