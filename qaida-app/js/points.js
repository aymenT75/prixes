// Système de Hasanat (حسنات) : points gagnés par pratique.
// Bonus série, précision, premier apprentissage. Vidéos prophètes à 300/500/700/900/1200 hasanat.

export const PASS_THRESHOLD = 95;

export const VIDEOS = [
  { id: "v1", name: "Prophète Adam", emoji: "👨", points: 300, duration: "18 min" },
  { id: "v2", name: "Prophète Nûh", emoji: "🕊️", points: 500, duration: "18 min" },
  { id: "v3", name: "Prophète Ibrâhîm", emoji: "🏛️", points: 700, duration: "18 min" },
  { id: "v4", name: "Prophète Mûsâ", emoji: "📜", points: 900, duration: "18 min" },
  { id: "v5", name: "Prophète Muhammad ﷺ", emoji: "☪️", points: 1200, duration: "25 min" },
];

export function practicePoints(opts) {
  const { accuracy, streakDays = 0, firstLearn = false } = opts;
  const breakdown = [];
  let total = 25; // base

  breakdown.push({ label: "Pratique", value: 25 });

  // Bonus précision (95-98 → +10, 98+ → +20)
  if (accuracy >= PASS_THRESHOLD) {
    const precisionBonus = accuracy >= 98 ? 20 : 10;
    total += precisionBonus;
    breakdown.push({ label: `Bonus précision (${accuracy}%)`, value: precisionBonus });
  }

  // Bonus série (7/14/30 jours → +50/+100/+200)
  if (streakDays >= 30) {
    total += 200;
    breakdown.push({ label: "Bonus série (30 j)", value: 200 });
  } else if (streakDays >= 14) {
    total += 100;
    breakdown.push({ label: "Bonus série (14 j)", value: 100 });
  } else if (streakDays >= 7) {
    total += 50;
    breakdown.push({ label: "Bonus série (7 j)", value: 50 });
  }

  // Bonus premier apprentissage
  if (firstLearn) {
    total += 10;
    breakdown.push({ label: "Premier apprentissage", value: 10 });
  }

  return { total, breakdown };
}

export function videoProgress(points) {
  const total = points;
  let unlockedVideos = 0;
  let nextVideo = null;

  for (const v of VIDEOS) {
    if (total >= v.points) unlockedVideos++;
    else if (!nextVideo) nextVideo = v;
  }

  const pointsToNext = nextVideo ? nextVideo.points - total : 0;
  return { unlockedVideos, nextVideo, pointsToNext };
}
