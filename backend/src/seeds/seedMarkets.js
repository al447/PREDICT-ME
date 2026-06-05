require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Category = require('../models/Category');
const Market = require('../models/Market');

const connectDB = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB connected for seeding');
};

const categories = [
  { name: 'Crypto', slug: 'crypto', icon: 'bitcoin', description: 'Cryptocurrency prediction markets', order: 1 },
  { name: 'Sports', slug: 'sports', icon: 'trophy', description: 'Sports prediction markets', order: 2 },
  { name: 'Weather', slug: 'weather', icon: 'cloud-sun', description: 'Weather prediction markets', order: 3 },
  { name: 'Politics', slug: 'politics', icon: 'landmark', description: 'Political prediction markets', order: 4 },
  { name: 'Finance', slug: 'finance', icon: 'trending-up', description: 'Financial prediction markets', order: 5 },
  { name: 'News', slug: 'news', icon: 'newspaper', description: 'Breaking news prediction markets', order: 6 },
];

const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const rndVol = () => rnd(1000, 50000000);
const futureDate = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return d; };
const yesNo = (yesProb) => [
  { name: 'Yes', probability: yesProb, price: yesProb },
  { name: 'No', probability: 100 - yesProb, price: 100 - yesProb },
];
const newsLink = (source, title) => ({ source, title, url: '#', timestamp: `${rnd(1, 23)}h ago` });

const buildMarkets = (catId, slug) => {
  const markets = [];

  if (slug === 'crypto') {
    const items = [
      ['Will BTC hit $120K by July 2026?', 'https://polymarket-upload.s3.us-east-2.amazonaws.com/BTC+fullsize.png', 62, ['bitcoin','price'], true, 4, [newsLink('CoinDesk','BTC surges toward new highs'), newsLink('Bloomberg','Bitcoin ETF inflows hit record')]],
      ['Will BTC hit $150K by end of 2026?', 'https://polymarket-upload.s3.us-east-2.amazonaws.com/BTC+fullsize.png', 38, ['bitcoin','price'], true, 4, [newsLink('Reuters','BTC bull run analysis')]],
      ['BTC above $100K on June 1, 2026?', 'https://polymarket-upload.s3.us-east-2.amazonaws.com/BTC+fullsize.png', 71, ['bitcoin'], false, 0, []],
      ['Will ETH hit $5,000 by August 2026?', 'https://polymarket-upload.s3.us-east-2.amazonaws.com/ethereum-logo-2014-5.png', 45, ['ethereum','price'], true, 4, [newsLink('Decrypt','ETH upgrade boosts price')]],
      ['ETH above $4,000 on July 1?', 'https://polymarket-upload.s3.us-east-2.amazonaws.com/ethereum-logo-2014-5.png', 58, ['ethereum'], false, 0, []],
      ['Will SOL hit $300 by Q3 2026?', 'https://polymarket-upload.s3.us-east-2.amazonaws.com/solana-sol-logo.png', 41, ['solana','price'], true, 4, [newsLink('The Block','Solana network activity record')]],
      ['SOL above $200 by end of June?', '◎', 67, ['solana'], false, 0, []],
      ['Will XRP hit $5 in 2026?', '✕', 29, ['xrp','price'], false, 4, []],
      ['XRP above $3 by July 2026?', '✕', 44, ['xrp'], false, 0, []],
      ['Will DOGE hit $1 by end of 2026?', '🐕', 23, ['dogecoin','price'], false, 0, []],
      ['DOGE above $0.50 by August?', '🐕', 37, ['dogecoin'], false, 0, []],
      ['Will BNB hit $1,000 in 2026?', '🔶', 31, ['bnb','price'], false, 0, []],
      ['Will SEC approve a Solana ETF by 2026?', '📋', 52, ['solana','etf'], true, 4, [newsLink('Bloomberg','SEC Solana ETF decision timeline')]],
      ['Will spot XRP ETF launch in US by July?', '📋', 48, ['xrp','etf'], true, 0, []],
      ['BTC ETF daily inflows above $500M in June?', '📊', 61, ['bitcoin','etf'], false, 4, []],
      ['Will Bitcoin dominance stay above 50% in Q3?', '📈', 72, ['bitcoin'], false, 0, []],
      ['Will total crypto market cap hit $5T in 2026?', '🌐', 44, ['crypto'], true, 4, [newsLink('CoinMarketCap','Market cap analysis')]],
      ['Will DeFi TVL exceed $200B by July?', '🔗', 35, ['defi'], false, 0, []],
      ['Ethereum to flip Bitcoin in market cap by 2027?', '⟠', 12, ['ethereum','bitcoin'], false, 0, []],
      ['Will Coinbase stock hit $400 by Q3?', '💹', 43, ['stocks','crypto'], true, 0, []],
      ['BTC 5-min high above $110K in June?', '🪙', 55, ['bitcoin'], false, 0, []],
      ['Will BTC drop below $80K in 2026?', '🪙', 18, ['bitcoin'], false, 0, []],
      ['Will Microstrategy hold 500K BTC by July?', '🏢', 39, ['bitcoin','microstrategy'], false, 0, []],
      ['Microstrategy stock above $500 by August?', '🏢', 46, ['microstrategy','stocks'], false, 0, []],
      ['Will ETH staking yield stay above 4% in Q3?', '⟠', 63, ['ethereum'], false, 0, []],
      ['Will new ATH be set for BTC before September?', '🪙', 57, ['bitcoin'], false, 4, []],
      ['Will Avalanche (AVAX) hit $50 in Q3?', '🔺', 34, ['avax','price'], false, 0, []],
      ['Will Chainlink (LINK) hit $30 by August?', '🔗', 41, ['chainlink','price'], false, 0, []],
      ['TON above $10 by end of July?', '💎', 47, ['ton','price'], false, 0, []],
      ['Will ADA hit $1.50 by Q4 2026?', '🔵', 28, ['cardano','price'], false, 0, []],
      ['Will Polkadot (DOT) hit $15 in 2026?', '⚫', 22, ['polkadot','price'], false, 0, []],
      ['Will SUI hit $5 by Q3 2026?', '🌊', 49, ['sui','price'], false, 0, []],
      ['BTC weekly close above $105K by June 30?', '🪙', 64, ['bitcoin'], false, 4, []],
      ['Will ETH/BTC ratio exceed 0.05 in 2026?', '⟠', 26, ['ethereum','bitcoin'], false, 0, []],
      ['Will Binance exchange stay #1 by volume?', '🔶', 84, ['bnb','exchange'], false, 0, []],
      ['Will a new L1 blockchain reach top 5 in 2026?', '🌐', 31, ['altcoin'], false, 0, []],
      ['Bitcoin halving effect: ATH within 18 months?', '🪙', 73, ['bitcoin','halving'], true, 4, [newsLink('Decrypt','Halving cycle analysis')]],
      ['Will PEPE coin market cap exceed $5B?', '🐸', 27, ['meme','pepe'], false, 0, []],
      ['Will WIF hit $10 in 2026?', '🐕', 21, ['meme','wif'], false, 0, []],
      ['Will total stablecoin supply exceed $300B?', '💵', 68, ['stablecoin'], false, 0, []],
      ['Will USDT maintain its #1 stablecoin position?', '💵', 89, ['stablecoin','usdt'], false, 0, []],
      ['Will BTC options expiry cause >5% swing in June?', '📉', 53, ['bitcoin','options'], false, 0, []],
      ['Will ETH gas fees average below 10 gwei in Q3?', '⟠', 44, ['ethereum'], false, 0, []],
      ['Crypto VC funding exceed $5B in Q2 2026?', '💰', 36, ['crypto','vc'], false, 0, []],
      ['Will a major exchange get hacked in 2026?', '🔓', 14, ['security','exchange'], false, 0, []],
      ['Will BTC be accepted by a G7 country as reserve?', '🏦', 19, ['bitcoin','regulation'], true, 0, [newsLink('Reuters','Country Bitcoin reserve news')]],
      ['Will US crypto regulation bill pass by Q4?', '⚖️', 41, ['regulation','crypto'], false, 0, []],
      ['Will BTC hash rate hit 1 Zettahash?', '⛏️', 54, ['bitcoin','mining'], false, 0, []],
      ['Will Lightning Network reach 10K BTC capacity?', '⚡', 47, ['bitcoin','lightning'], false, 0, []],
      ['ETH Layer 2 TVL exceed $100B by Q4 2026?', '⟠', 58, ['ethereum','layer2'], false, 4, []],
    ];
    items.forEach(([title, image, prob, tags, featured, rewards, newsLinks], i) => {
      const p = rnd(Math.max(5, prob - 10), Math.min(95, prob + 10));
      markets.push({
        title, description: `This market resolves Yes if ${title.replace('Will ', '').replace('?', '')} occurs. Resolution based on public price data.`,
        category: catId, categorySlug: 'crypto', slug: `crypto-${i + 1}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
        outcomes: yesNo(p), volume: rndVol(), liquidity: rnd(5000, 1000000),
        endDate: futureDate(rnd(2, 90)), image, tags, featured, isNewMarket: i < 15,
        rewards, newsLinks,
      });
    });
  }

  if (slug === 'sports') {
    const items = [
      ['Will Celtics win the 2026 NBA Finals?', '', 35, ['nba','basketball'], true, 0, [newsLink('ESPN','NBA Finals preview')]],
      ['Will Lakers make the 2026 NBA Playoffs?', '', 62, ['nba','lakers'], false, 0, []],
      ['NBA MVP 2025-26: Will it be Luka Doncic?', '', 28, ['nba','mvp'], true, 0, []],
      ['Will Yankees win 2026 MLB World Series?', '', 22, ['mlb','baseball'], true, 4, [newsLink('ESPN','MLB standings update')]],
      ['Will Dodgers repeat as MLB champions?', '', 31, ['mlb','dodgers'], false, 0, []],
      ['MLB Home Run leader 2026: Aaron Judge?', '⚾', 37, ['mlb','baseball'], false, 0, []],
      ['Will a no-hitter be thrown in July 2026?', '⚾', 78, ['mlb','baseball'], false, 0, []],
      ['Will Oilers win the 2026 NHL Stanley Cup?', '🏒', 24, ['nhl','hockey'], true, 0, [newsLink('TSN','Stanley Cup odds')]],
      ['Will Carolina Hurricanes reach NHL Finals?', '🏒', 31, ['nhl'], false, 0, []],
      ['UFC 310 main event: Will champion retain?', '🥊', 58, ['ufc','mma'], true, 4, [newsLink('MMAJunkie','UFC fight preview')]],
      ['UFC: Will Jon Jones fight before July 2026?', '🥊', 44, ['ufc','mma'], false, 0, []],
      ['F1: Will Verstappen win Monaco GP 2026?', '🏎️', 41, ['f1','formula1'], true, 4, [newsLink('Autosport','Monaco GP preview')]],
      ['F1 2026 World Championship: Verstappen?', '🏎️', 38, ['f1','formula1'], false, 0, []],
      ['Wimbledon 2026 Men\'s Singles: Djokovic?', '🎾', 29, ['tennis','wimbledon'], true, 4, [newsLink('BBC Sport','Wimbledon preview')]],
      ['French Open 2026 winner: Carlos Alcaraz?', '🎾', 34, ['tennis','frenchopen'], false, 0, []],
      ['US Open 2026 Men\'s winner: Sinner?', '🎾', 31, ['tennis','usopen'], false, 0, []],
      ['Champions League Final 2026: Real Madrid?', '⚽', 27, ['soccer','champions-league'], true, 4, [newsLink('UEFA','Champions League preview')]],
      ['Will Messi retire before end of 2026?', '⚽', 21, ['soccer','messi'], false, 0, []],
      ['Premier League 2025-26 winner: Man City?', '⚽', 33, ['soccer','premier-league'], false, 0, []],
      ['World Cup 2026 winner: Brazil?', '⚽', 18, ['soccer','world-cup'], true, 0, [newsLink('FIFA','World Cup predictions')]],
      ['World Cup 2026 winner: France?', '⚽', 16, ['soccer','world-cup'], false, 0, []],
      ['Masters 2026 winner: Rory McIlroy?', '⛳', 22, ['golf','masters'], true, 0, [newsLink('Golf Channel','Masters preview')]],
      ['Will Tiger Woods play at the Masters?', '⛳', 31, ['golf','tiger'], false, 0, []],
      ['PGA Championship 2026: Scottie Scheffler?', '⛳', 28, ['golf','pga'], false, 0, []],
      ['Tour de France 2026: Tadej Pogacar?', '🚴', 44, ['cycling','tdf'], false, 0, []],
      ['Olympics 2028: USA leads gold medal count?', '🥇', 62, ['olympics'], false, 0, []],
      ['Boxing: Fury vs Usyk 3 happening in 2026?', '🥊', 41, ['boxing'], true, 0, []],
      ['Will Canelo Alvarez fight in 2026?', '🥊', 74, ['boxing'], false, 0, []],
      ['IPL 2026 winner: Mumbai Indians?', '🏏', 19, ['cricket','ipl'], false, 0, []],
      ['England to win Cricket World Cup 2026?', '🏏', 23, ['cricket'], false, 0, []],
      ['NFL Super Bowl LXI: Chiefs to win?', '🏈', 24, ['nfl','football'], true, 4, [newsLink('NFL.com','Super Bowl odds')]],
      ['NFL MVP 2026 season: Patrick Mahomes?', '🏈', 32, ['nfl','football'], false, 0, []],
      ['Will an NFL player rush for 2000 yards in 2026?', '🏈', 28, ['nfl','football'], false, 0, []],
      ['NBA: Will new CBA be signed by July?', '🏀', 61, ['nba','business'], false, 0, []],
      ['Will LeBron James retire in 2026?', '🏀', 19, ['nba','lebron'], false, 0, []],
      ['F1: New team to score podium in 2026?', '🏎️', 34, ['f1'], false, 0, []],
      ['Tour de France: Any American in top 3?', '🚴', 27, ['cycling'], false, 0, []],
      ['Will Novak Djokovic win a Grand Slam in 2026?', '🎾', 44, ['tennis','djokovic'], false, 0, []],
      ['Euro 2026 qualifier: England tops group?', '⚽', 67, ['soccer','euro'], false, 0, []],
      ['Will Barcelona win La Liga 2025-26?', '⚽', 38, ['soccer','laliga'], false, 0, []],
      ['UFC: New heavyweight champion by July?', '🥊', 36, ['ufc','heavyweight'], false, 0, []],
      ['MLB: 100+ win team in 2026 regular season?', '⚾', 71, ['mlb','baseball'], false, 0, []],
      ['Will Golden State Warriors reach 2026 playoffs?', '🏀', 54, ['nba','warriors'], false, 0, []],
      ['NHL: 60+ goals in a season in 2025-26?', '🏒', 23, ['nhl','hockey'], false, 0, []],
      ['Will there be a penalty shootout at UCL Final?', '⚽', 32, ['soccer'], false, 0, []],
      ['Wimbledon Women\'s: Iga Swiatek wins?', '🎾', 37, ['tennis','wimbledon'], false, 0, []],
      ['Will Max Verstappen clinch title before October?', '🏎️', 43, ['f1'], false, 0, []],
      ['MLB: Shohei Ohtani wins another Cy Young?', '⚾', 29, ['mlb','ohtani'], false, 0, []],
      ['Golf: Any golfer wins 3 majors in 2026?', '⛳', 8, ['golf'], false, 0, []],
      ['NBA Finals 2026: Goes to Game 7?', '🏀', 34, ['nba'], false, 0, []],
    ];
    items.forEach(([title, image, prob, tags, featured, rewards, newsLinks], i) => {
      const p = rnd(Math.max(5, prob - 10), Math.min(95, prob + 10));
      markets.push({
        title, description: `Prediction market for: ${title}. Resolves based on official results.`,
        category: catId, categorySlug: 'sports', slug: `sports-${i + 1}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
        outcomes: yesNo(p), volume: rndVol(), liquidity: rnd(5000, 500000),
        endDate: futureDate(rnd(5, 120)), image, tags, featured, isNewMarket: i < 15,
        rewards, newsLinks,
      });
    });
  }

  if (slug === 'weather') {
    const items = [
      ['Highest temp in Austin above 100°F on May 20?', '☀️', 68, ['temperature','austin'], true, 4, [newsLink('Weather.com','Austin heat forecast')]],
      ['NYC high above 85°F on May 25?', '🌡️', 54, ['temperature','nyc'], false, 0, []],
      ['Will London exceed 30°C in June 2026?', '🌤️', 41, ['temperature','london'], true, 0, []],
      ['Tokyo temperature above 35°C in July?', '🌡️', 72, ['temperature','tokyo'], false, 0, []],
      ['Paris above 28°C on July 14, 2026?', '☀️', 63, ['temperature','paris'], false, 0, []],
      ['Dubai above 45°C in August 2026?', '🔥', 61, ['temperature','dubai'], false, 0, []],
      ['Sydney below 10°C on June 21?', '❄️', 44, ['temperature','sydney'], false, 0, []],
      ['Moscow below -10°C in January 2027?', '🥶', 58, ['temperature','moscow'], false, 0, []],
      ['Will Chicago see a polar vortex in Q1 2027?', '❄️', 36, ['temperature','chicago'], false, 0, []],
      ['Miami high above 95°F in August?', '☀️', 81, ['temperature','miami'], false, 0, []],
      ['Seattle gets >2 inches rain in June?', '🌧️', 47, ['precipitation','seattle'], true, 4, [newsLink('NWS','Seattle rain forecast')]],
      ['Will Houston flood in June 2026?', '🌊', 32, ['precipitation','houston'], false, 0, []],
      ['Phoenix below 0.1 inches rain in July?', '🌵', 84, ['precipitation','phoenix'], false, 0, []],
      ['Will NYC get >5 inches snow in winter 2026?', '❄️', 61, ['precipitation','nyc'], false, 0, []],
      ['Will Mumbai get early monsoon rains before June 1?', '🌧️', 54, ['precipitation','mumbai'], false, 0, []],
      ['Category 4+ hurricane in Atlantic by August 2026?', '🌀', 47, ['hurricane'], true, 4, [newsLink('NOAA','Hurricane season outlook')]],
      ['Will a hurricane make US landfall in 2026?', '🌀', 62, ['hurricane'], false, 0, []],
      ['Typhoon to hit Philippines before October?', '🌀', 71, ['typhoon','philippines'], false, 0, []],
      ['Will cyclone season be above average in 2026?', '🌀', 58, ['cyclone'], false, 0, []],
      ['Atlantic named storm count above 20 in 2026?', '⛈️', 49, ['hurricane','atlantic'], false, 0, []],
      ['Magnitude 7.0+ earthquake in Pacific Ring in Q3?', '🌍', 44, ['earthquake'], true, 0, [newsLink('USGS','Seismic activity report')]],
      ['Will California experience M6.0+ quake in 2026?', '🌍', 38, ['earthquake','california'], false, 0, []],
      ['Japan earthquake above M7.5 in 2026?', '🌍', 31, ['earthquake','japan'], false, 0, []],
      ['Turkey/Syria region quake above M6.0 in Q3?', '🌍', 36, ['earthquake'], false, 0, []],
      ['More than 500 tornadoes in US by September?', '🌪️', 54, ['tornado'], true, 4, [newsLink('SPC','Tornado season forecast')]],
      ['EF4+ tornado in Oklahoma in 2026?', '🌪️', 29, ['tornado','oklahoma'], false, 0, []],
      ['Tornado outbreak >20 twisters in one day?', '🌪️', 33, ['tornado'], false, 0, []],
      ['Active volcano eruption in Indonesia in Q3?', '🌋', 41, ['volcano'], false, 0, []],
      ['Yellowstone seismic activity alert in 2026?', '🌋', 12, ['volcano','yellowstone'], false, 0, []],
      ['Etna eruption affects Sicily flights in 2026?', '🌋', 37, ['volcano','etna'], false, 0, []],
      ['WHO declares new pandemic by end of 2026?', '🦠', 8, ['pandemic'], true, 0, []],
      ['New respiratory virus outbreak in Asia in 2026?', '🦠', 22, ['pandemic'], false, 0, []],
      ['Global average temp record broken in 2026?', '🌡️', 61, ['climate'], true, 4, [newsLink('WMO','Climate record report')]],
      ['Arctic sea ice at record low in September 2026?', '🧊', 54, ['climate','arctic'], false, 0, []],
      ['Amazon deforestation rate increase in 2026?', '🌳', 37, ['climate','amazon'], false, 0, []],
      ['Major wildfire in California before August?', '🔥', 63, ['wildfire','california'], false, 0, []],
      ['Australian bushfire emergency declared in 2026?', '🔥', 38, ['wildfire','australia'], false, 0, []],
      ['Saharan dust storm reaches UK in summer 2026?', '🌫️', 41, ['weather','uk'], false, 0, []],
      ['Record snowfall in Alps ski season 2025-26?', '⛷️', 44, ['snow','alps'], false, 0, []],
      ['Hottest June on record globally in 2026?', '☀️', 57, ['climate','temperature'], false, 0, []],
      ['Will La Nina conditions persist through Q3?', '🌊', 48, ['elnino','climate'], false, 0, []],
      ['Boston above 95°F before July 4?', '☀️', 39, ['temperature','boston'], false, 0, []],
      ['Berlin below -5°C in January 2027?', '❄️', 47, ['temperature','berlin'], false, 0, []],
      ['Seoul heatwave above 37°C in August?', '🌡️', 56, ['temperature','seoul'], false, 0, []],
      ['Cape Town drought emergency in 2026?', '🏜️', 28, ['drought','capetown'], false, 0, []],
      ['Flash floods in Germany summer 2026?', '🌊', 42, ['precipitation','germany'], false, 0, []],
      ['Record low temperatures in Siberia in 2026?', '🥶', 53, ['temperature','siberia'], false, 0, []],
      ['Will monsoon season start early in India 2026?', '🌧️', 44, ['precipitation','india'], false, 0, []],
      ['Major dust storm in Middle East in Q3?', '🌫️', 61, ['weather','middleeast'], false, 0, []],
      ['New Zealand below-average rainfall in Q4 2026?', '🌧️', 39, ['precipitation','newzealand'], false, 0, []],
    ];
    items.forEach(([title, image, prob, tags, featured, rewards, newsLinks], i) => {
      const p = rnd(Math.max(5, prob - 10), Math.min(95, prob + 10));
      markets.push({
        title, description: `Weather prediction: ${title} Resolves based on official meteorological data.`,
        category: catId, categorySlug: 'weather', slug: `weather-${i + 1}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
        outcomes: yesNo(p), volume: rndVol(), liquidity: rnd(1000, 200000),
        endDate: futureDate(rnd(2, 60)), image, tags, featured, isNewMarket: i < 15,
        rewards, newsLinks,
      });
    });
  }

  if (slug === 'politics') {
    const items = [
      ['Will Democrats win the House in 2026 midterms?', '🏛️', 43, ['midterms','democrat'], true, 4, [newsLink('Politico','2026 midterms forecast')]],
      ['Will Republicans keep the Senate in 2026?', '🏛️', 61, ['midterms','republican'], true, 0, []],
      ['Trump approval above 45% by July 2026?', '🇺🇸', 37, ['trump','approval'], true, 4, [newsLink('FiveThirtyEight','Approval rating tracker')]],
      ['Will Trump sign executive order on TikTok ban?', '📱', 48, ['trump','tiktok'], false, 0, []],
      ['Will US debt ceiling crisis happen in Q3 2026?', '💰', 34, ['congress','debt'], false, 0, []],
      ['Will US government shutdown occur in 2026?', '🏛️', 28, ['congress','shutdown'], true, 0, []],
      ['Will DOGE budget cuts reduce federal spending 10%?', '✂️', 22, ['trump','doge'], false, 0, []],
      ['Will Supreme Court overturn major ruling in 2026?', '⚖️', 44, ['courts','supreme-court'], false, 0, []],
      ['Will Kamala Harris run for CA governor in 2027?', '🗳️', 38, ['democrat','california'], false, 0, []],
      ['Will Biden endorse a 2028 Democratic candidate?', '🗳️', 31, ['democrat','2028'], false, 0, []],
      ['UK snap election called before end of 2026?', '🇬🇧', 24, ['uk-elections','uk'], true, 0, [newsLink('BBC','UK political forecast')]],
      ['Will Labour Party stay in power in UK through 2027?', '🇬🇧', 58, ['uk-elections','labour'], false, 0, []],
      ['German coalition government to collapse in 2026?', '🇩🇪', 29, ['german-elections','germany'], false, 0, []],
      ['Will French far-right win 2027 presidential election?', '🇫🇷', 36, ['french-elections','france'], false, 0, []],
      ['South Korea presidential election winner: opposition?', '🇰🇷', 44, ['south-korea'], true, 4, [newsLink('Reuters','South Korea election')]],
      ['Will Japan call snap election in 2026?', '🇯🇵', 31, ['japan'], false, 0, []],
      ['Will China reunification attempt before 2030?', '🇨🇳', 8, ['china','taiwan'], false, 0, []],
      ['Brazil Lula approval above 40% by Q4?', '🇧🇷', 44, ['brazil'], false, 0, []],
      ['Canada federal election: Liberal majority?', '🇨🇦', 27, ['canada'], true, 0, []],
      ['Venezuela opposition wins local elections in 2026?', '🇻🇪', 21, ['venezuela'], false, 0, []],
      ['Will NATO expand to include new member in 2026?', '🌐', 34, ['nato','global'], false, 0, []],
      ['Ukraine-Russia ceasefire agreement in 2026?', '🕊️', 28, ['ukraine','russia'], true, 4, [newsLink('AP','Peace talks update')]],
      ['Will Israel-Gaza ceasefire hold through Q3?', '🕊️', 41, ['israel','middle-east'], false, 0, []],
      ['US Congress to pass immigration reform in 2026?', '🏛️', 19, ['congress','immigration'], false, 0, []],
      ['Will a new Justice be confirmed to Supreme Court?', '⚖️', 37, ['courts','supreme-court'], false, 0, []],
      ['Will Epstein files be fully declassified in 2026?', '📄', 46, ['epstein','trump'], false, 0, []],
      ['Trump cabinet reshuffle before August 2026?', '🏛️', 44, ['trump','cabinet'], false, 0, []],
      ['Will Trump visit China in 2026?', '🌐', 31, ['trump','china'], false, 0, []],
      ['Colombia presidential approval above 50%?', '🇨🇴', 33, ['colombia'], false, 0, []],
      ['Will UN Security Council pass new sanctions?', '🌐', 47, ['global','sanctions'], false, 0, []],
      ['Will India-Pakistan tensions escalate in 2026?', '🌏', 28, ['india','pakistan'], false, 0, []],
      ['Will Mexico president maintain 60%+ approval?', '🇲🇽', 52, ['mexico'], false, 0, []],
      ['Will Saudi Arabia normalize with Israel in 2026?', '🤝', 23, ['middleeast','saudi'], false, 0, []],
      ['Will US impose new China tariffs above 25%?', '💼', 54, ['trump','china','tariffs'], false, 0, []],
      ['US midterms voter turnout above 50%?', '🗳️', 67, ['midterms'], false, 0, []],
      ['Will any 2024 election officials face criminal charges?', '⚖️', 31, ['us-election'], false, 0, []],
      ['Will AI regulation bill pass US Senate in 2026?', '🤖', 24, ['congress','ai'], false, 0, []],
      ['Will DC statehood bill pass Congress in 2026?', '🏛️', 11, ['congress','dc'], false, 0, []],
      ['Will there be a primary challenge to Trump in 2028?', '🗳️', 34, ['trump','2028'], false, 0, []],
      ['Major cyber attack on US infrastructure in 2026?', '💻', 27, ['security','us'], false, 0, []],
      ['Will Iran nuclear deal be renegotiated in 2026?', '☢️', 19, ['iran','nuclear'], false, 0, []],
      ['NATO defense spending above 2% GDP by all members?', '🌐', 44, ['nato'], false, 0, []],
      ['Will Zelensky remain president of Ukraine in Q4?', '🇺🇦', 72, ['ukraine'], false, 0, []],
      ['Will Turkish lira fall below 45 per USD?', '🇹🇷', 56, ['turkey','economics'], false, 0, []],
      ['Argentina dollarization bill passes in 2026?', '🇦🇷', 33, ['argentina','economics'], false, 0, []],
      ['Will Spain call early elections in 2026?', '🇪🇸', 27, ['spain','europe'], false, 0, []],
      ['Will Italy government survive full term?', '🇮🇹', 48, ['italy','europe'], false, 0, []],
      ['Will Polish presidential election be competitive?', '🇵🇱', 51, ['poland','europe'], false, 0, []],
      ['Taiwan to hold major defense drills in Q3 2026?', '🇹🇼', 67, ['taiwan','china'], false, 0, []],
      ['Will any G7 leader resign by end of 2026?', '🌐', 29, ['global','g7'], false, 0, []],
    ];
    items.forEach(([title, image, prob, tags, featured, rewards, newsLinks], i) => {
      const p = rnd(Math.max(5, prob - 10), Math.min(95, prob + 10));
      markets.push({
        title, description: `Political prediction: ${title} Resolves based on official announcements and news sources.`,
        category: catId, categorySlug: 'politics', slug: `politics-${i + 1}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
        outcomes: yesNo(p), volume: rndVol(), liquidity: rnd(5000, 2000000),
        endDate: futureDate(rnd(7, 180)), image, tags, featured, isNewMarket: i < 15,
        rewards, newsLinks,
      });
    });
  }

  if (slug === 'finance') {
    const items = [
      ['Will AAPL hit $250 by July 2026?', '🍎', 44, ['stocks','aapl'], true, 4, [newsLink('Bloomberg','Apple stock analysis')]],
      ['AMZN above $220 this week?', '📦', 58, ['stocks','amzn'], true, 0, []],
      ['Will TSLA hit $400 by Q3 2026?', '🚗', 31, ['stocks','tsla'], true, 4, [newsLink('Reuters','Tesla price target')]],
      ['NVDA above $200 by end of June?', '💻', 62, ['stocks','nvda'], true, 4, [newsLink('MarketWatch','NVDA analyst upgrades')]],
      ['Will GOOGL hit $200 by August?', '🔍', 47, ['stocks','googl'], false, 0, []],
      ['META above $600 by Q3 2026?', '👤', 54, ['stocks','meta'], false, 0, []],
      ['MSFT hits $500 by end of 2026?', '🪟', 38, ['stocks','msft'], false, 0, []],
      ['Will S&P 500 reach 6,000 by July 2026?', '📈', 63, ['indices','sp500'], true, 4, [newsLink('WSJ','Market outlook')]],
      ['S&P 500 daily close above 5,800 this week?', '📊', 71, ['indices','sp500'], false, 0, []],
      ['Will NASDAQ hit 22,000 in Q3 2026?', '💹', 48, ['indices','nasdaq'], false, 0, []],
      ['Dow Jones above 46,000 by August?', '📈', 56, ['indices','dow'], false, 0, []],
      ['Will Fed cut rates in June 2026?', '🏦', 37, ['fed-rates','fed'], true, 4, [newsLink('Reuters','Fed rate decision')]],
      ['Fed funds rate below 4% by year end?', '🏦', 44, ['fed-rates','fed'], false, 0, []],
      ['Will Fed announce 2+ rate cuts in 2026?', '🏦', 51, ['fed-rates'], false, 0, []],
      ['AAPL Q2 2026 earnings beat expectations?', '🍎', 62, ['earnings','aapl'], true, 0, []],
      ['AMZN Q2 earnings above $1.40 EPS?', '📦', 58, ['earnings','amzn'], false, 0, []],
      ['NVDA Q1 revenue above $40B?', '💻', 67, ['earnings','nvda'], false, 0, []],
      ['Will Gold hit $3,500/oz by Q3 2026?', '🥇', 41, ['commodities','gold'], true, 4, [newsLink('Bloomberg','Gold price forecast')]],
      ['Gold above $3,000/oz by end of June?', '🥇', 73, ['commodities','gold'], false, 0, []],
      ['Will Oil (WTI) hit $90/barrel by August?', '🛢️', 38, ['commodities','oil'], false, 0, []],
      ['Silver above $35/oz by July?', '🥈', 46, ['commodities','silver'], false, 0, []],
      ['Will EUR/USD exceed 1.15 by August?', '💶', 34, ['forex','eur'], false, 0, []],
      ['USD/JPY below 150 by Q3 2026?', '💴', 42, ['forex','jpy'], false, 0, []],
      ['Will British Pound rise above 1.35 vs USD?', '💷', 48, ['forex','gbp'], false, 0, []],
      ['Reddit IPO market cap above $15B by Q4?', '🤖', 54, ['ipos'], true, 0, []],
      ['Will Stripe IPO in 2026?', '💳', 38, ['ipos','stripe'], false, 0, []],
      ['Will SpaceX IPO be announced in 2026?', '🚀', 22, ['ipos','spacex'], false, 0, []],
      ['Will TSMC stock hit $250 by Q3?', '🔬', 43, ['stocks','tsmc'], false, 0, []],
      ['INTC above $30 by end of 2026?', '💾', 39, ['stocks','intc'], false, 0, []],
      ['Will JPMorgan hit $280 by August?', '🏦', 51, ['stocks','jpm'], false, 0, []],
      ['US CPI below 3% by end of Q3 2026?', '📊', 44, ['economics','inflation'], true, 4, [newsLink('BLS','Inflation data')]],
      ['US unemployment below 4% in Q3?', '👷', 67, ['economics','jobs'], false, 0, []],
      ['Will US GDP growth exceed 2.5% in 2026?', '📈', 48, ['economics','gdp'], false, 0, []],
      ['Warren Buffett endorses new major investment in 2026?', '🎩', 31, ['stocks','berkshire'], false, 0, []],
      ['Will Berkshire Hathaway stock hit $700K?', '🎩', 43, ['stocks','brk'], false, 0, []],
      ['Will Elon Musk sell more Tesla shares in Q3?', '🚗', 52, ['tsla','musk'], false, 0, []],
      ['AMZN stock split announced in 2026?', '📦', 24, ['stocks','amzn'], false, 0, []],
      ['Will NVDA market cap exceed $4T?', '💻', 41, ['stocks','nvda'], false, 0, []],
      ['Copper above $5/lb by August 2026?', '🔩', 37, ['commodities','copper'], false, 0, []],
      ['Natural gas price above $3.50/MMBtu in Q3?', '🔥', 44, ['commodities','natgas'], false, 0, []],
      ['Will VIX spike above 30 in Q3 2026?', '📉', 28, ['indices','vix'], false, 0, []],
      ['10-year Treasury yield above 5% in 2026?', '📊', 33, ['treasuries'], false, 0, []],
      ['Will any US bank fail in 2026?', '🏦', 12, ['banking','risk'], false, 0, []],
      ['Will China cut interest rates in Q3 2026?', '🇨🇳', 58, ['china','economics'], false, 0, []],
      ['ECB to pause rate cuts in Q3 2026?', '💶', 44, ['ecb','europe'], false, 0, []],
      ['Will India Sensex hit 100,000 in 2026?', '🇮🇳', 47, ['indices','india'], false, 0, []],
      ['AAPL market cap above $4T in 2026?', '🍎', 36, ['stocks','aapl'], false, 0, []],
      ['Will a major hedge fund blow up in 2026?', '📉', 9, ['risk'], false, 0, []],
      ['US IPO market volume above $50B in 2026?', '💹', 43, ['ipos'], false, 0, []],
      ['Tesla FSD fully approved by NHTSA in 2026?', '🚗', 28, ['tsla','tech'], false, 0, []],
    ];
    items.forEach(([title, image, prob, tags, featured, rewards, newsLinks], i) => {
      const p = rnd(Math.max(5, prob - 10), Math.min(95, prob + 10));
      markets.push({
        title, description: `Financial prediction: ${title} Resolves based on official market data and announcements.`,
        category: catId, categorySlug: 'finance', slug: `finance-${i + 1}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
        outcomes: yesNo(p), volume: rndVol(), liquidity: rnd(10000, 5000000),
        endDate: futureDate(rnd(2, 90)), image, tags, featured, isNewMarket: i < 15,
        rewards, newsLinks,
      });
    });
  }

  if (slug === 'news') {
    const items = [
      ['Apple announces AR/VR glasses at WWDC 2026?', '🥽', 54, ['tech','apple'], true, 4, [newsLink('9to5Mac','Apple AR glasses leak'), newsLink('Bloomberg','WWDC 2026 preview')]],
      ['OpenAI releases GPT-5 by July 2026?', '🤖', 61, ['ai','openai'], true, 4, [newsLink('TechCrunch','GPT-5 release timeline')]],
      ['Will SpaceX Starship reach orbit before July?', '🚀', 67, ['space','spacex'], true, 4, [newsLink('Space.com','Starship launch update')]],
      ['NASA Artemis III crew lands on Moon in 2026?', '🌕', 28, ['space','nasa'], true, 0, []],
      ['EU AI Act fully enforced by Q4 2026?', '🤖', 74, ['ai','regulation'], false, 0, []],
      ['Will Google launch new AI model beating GPT-5?', '🔍', 49, ['ai','google'], true, 0, []],
      ['Microsoft integrates AI into all Office apps by Q3?', '🪟', 71, ['ai','microsoft'], false, 0, []],
      ['Will Twitter/X hit 500M daily active users?', '🐦', 31, ['social-media','x'], false, 0, []],
      ['Meta releases new AR glasses in 2026?', '👓', 47, ['tech','meta'], false, 0, []],
      ['Will TikTok be banned in the US in 2026?', '📱', 38, ['social-media','tiktok'], true, 4, [newsLink('Reuters','TikTok ban update')]],
      ['Netflix surpasses 350M subscribers in 2026?', '🎬', 44, ['media','netflix'], false, 0, []],
      ['Will YouTube introduce paid tiers in 2026?', '▶️', 29, ['media','youtube'], false, 0, []],
      ['Taylor Swift new album released by August 2026?', '🎵', 52, ['entertainment','music'], true, 0, []],
      ['Oscar Best Picture 2027: A24 film wins?', '🎬', 33, ['entertainment','oscars'], false, 0, []],
      ['Will new Avatar movie break box office records?', '🎥', 28, ['entertainment','movies'], false, 0, []],
      ['AI achieves AGI milestone announced publicly?', '🤖', 11, ['ai','agi'], true, 4, [newsLink('Nature','AI breakthrough paper')]],
      ['Will humanoid robots be commercially sold in 2026?', '🦾', 44, ['tech','robotics'], false, 0, []],
      ['Nuclear fusion power plant operational in 2026?', '⚡', 7, ['science','energy'], false, 0, []],
      ['Will COVID-19 variant cause new health concern?', '🦠', 31, ['health','pandemic'], false, 0, []],
      ['Major earthquake causes tsunami warning in Pacific?', '🌊', 24, ['disaster'], false, 0, []],
      ['Will Elon Musk sell more Twitter/X shares in 2026?', '🐦', 48, ['musk','x'], false, 0, []],
      ['Amazon launches drone delivery in 50+ US cities?', '🚁', 38, ['tech','amazon'], false, 0, []],
      ['Will Apple surpass Samsung in global phone sales?', '📱', 27, ['tech','apple'], false, 0, []],
      ['Major tech company announces 10K+ layoffs in Q3?', '👥', 41, ['tech','layoffs'], false, 0, []],
      ['Will crypto become legal tender in any G20 nation?', '₿', 14, ['crypto','regulation'], false, 0, []],
      ['First commercial space hotel announced in 2026?', '🏨', 19, ['space','commercial'], false, 0, []],
      ['Will quantum computer break RSA encryption by 2027?', '💻', 8, ['tech','quantum'], false, 0, []],
      ['Major ransomware attack on hospital network in 2026?', '🏥', 44, ['security','cyber'], false, 0, []],
      ['Will Spotify reach 700M monthly active users?', '🎵', 54, ['media','spotify'], false, 0, []],
      ['New Disney theme park location announced in 2026?', '🏰', 36, ['entertainment','disney'], false, 0, []],
      ['Anthropic releases Claude 4 by end of 2026?', '🤖', 62, ['ai','anthropic'], false, 0, []],
      ['Will Apple acquire a major AI company in 2026?', '🍎', 22, ['tech','apple','ma'], false, 0, []],
      ['Autonomous vehicle fully driverless in 10+ US cities?', '🚗', 38, ['tech','av'], false, 0, []],
      ['Will a major social media platform shut down in 2026?', '📱', 9, ['social-media'], false, 0, []],
      ['Will new world population record be set in 2026?', '🌍', 77, ['world','demographics'], false, 0, []],
      ['India becomes world\'s largest economy by 2030?', '🇮🇳', 13, ['economics','india'], false, 0, []],
      ['Will Dogecoin become official US currency?', '🐕', 2, ['meme','crypto'], false, 0, []],
      ['Will a new billionaire emerge from AI sector in 2026?', '💰', 68, ['ai','wealth'], false, 0, []],
      ['Will Amazon Web Services hit $200B revenue run rate?', '☁️', 44, ['tech','aws'], false, 0, []],
      ['Major newspaper to go fully digital in 2026?', '📰', 57, ['media','digital'], false, 0, []],
      ['Will Roblox hit 100M daily active users?', '🎮', 46, ['gaming','roblox'], false, 0, []],
      ['GTA 6 release date confirmed for 2026?', '🎮', 63, ['gaming','rockstar'], false, 0, []],
      ['Will movie theater industry fully recover to pre-COVID?', '🎬', 29, ['entertainment'], false, 0, []],
      ['Will US and China reach new trade deal in 2026?', '🤝', 32, ['trade','geopolitics'], false, 0, []],
      ['Will deepfake technology be regulated in US?', '🤖', 47, ['ai','regulation'], false, 0, []],
      ['SpaceX lunar lander successfully tests in 2026?', '🌕', 61, ['space','spacex'], false, 0, []],
      ['Will the WHO reform after 2026 review?', '🌍', 44, ['health','who'], false, 0, []],
      ['Will CERN discover new particle in 2026?', '⚛️', 18, ['science','physics'], false, 0, []],
      ['First Mars soil sample returned to Earth in 2026?', '🪐', 12, ['space','mars'], false, 0, []],
      ['Will Elon Musk remain CEO of Tesla by end of 2026?', '🚗', 72, ['musk','tesla'], false, 0, []],
    ];
    items.forEach(([title, image, prob, tags, featured, rewards, newsLinks], i) => {
      const p = rnd(Math.max(5, prob - 10), Math.min(95, prob + 10));
      markets.push({
        title, description: `Breaking news prediction: ${title} Resolves based on publicly verifiable news sources.`,
        category: catId, categorySlug: 'news', slug: `news-${i + 1}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
        outcomes: yesNo(p), volume: rndVol(), liquidity: rnd(2000, 1000000),
        endDate: futureDate(rnd(2, 180)), image, tags, featured, isNewMarket: i < 15,
        rewards, newsLinks,
      });
    });
  }

  return markets;
};

const seed = async () => {
  await connectDB();
  await Category.deleteMany({});
  await Market.deleteMany({});
  console.log('Cleared existing data');

  const createdCats = await Category.insertMany(categories);
  console.log(`Created ${createdCats.length} categories`);

  let totalMarkets = 0;
  for (const cat of createdCats) {
    const markets = buildMarkets(cat._id, cat.slug);
    await Market.insertMany(markets);
    totalMarkets += markets.length;
    console.log(`Seeded ${markets.length} markets for ${cat.name}`);
  }

  console.log(`\nSeeding complete! Total markets: ${totalMarkets}`);
  process.exit(0);
};

seed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
