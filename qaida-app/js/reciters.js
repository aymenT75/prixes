// Récitateurs & modes de récitation adaptatifs pour l'apprentissage.

export const RECITATION_STYLES = [
  { id: "tahqiq", nom: "At-Tahqîq", nom_arabe: "التحقيق", tempo: "Très lent", description: "Lecture extrêmement lente et posée. Idéale pour l'apprentissage avec un professeur, détaillant chaque lettre." },
  { id: "tartil", nom: "At-Tartîl", nom_arabe: "الترتيل", tempo: "Lent", description: "Lecture lente et rythmée, respectant strictement les règles. Idéale pour la méditation et la compréhension du sens." },
  { id: "tadwir", nom: "At-Tadwîr", nom_arabe: "التدوير", tempo: "Intermédiaire", description: "Un rythme intermédiaire entre le Tartîl et Al-Hadr." },
  { id: "hadr", nom: "Al-Hadr", nom_arabe: "الحدر", tempo: "Rapide", description: "Lecture rapide et fluide, tout en respectant les règles du Tajwid. Souvent utilisée pour la mémorisation." },
];

export const RECITERS = [
  {
    id: "al_husary_muallim",
    nom: "Mahmoud Khalil Al-Husary",
    nom_arabe: "محمود خليل الحصري",
    style: "Al-Mus'haf Al-Mu'allim (Murattal lent et pédagogique)",
    categorie: "Débutant & Précision",
    mode: "tahqiq",
    description: "La référence absolue de la récitation pédagogique, avec une articulation lente et parfaite de chaque lettre.",
    api_slug: "Husary_Muallim_128kbps",
    everyayah: "Husary_Muallim_128kbps",
  },
  {
    id: "al_minshawi_muallim",
    nom: "Mohamed Siddiq El-Minshawi",
    nom_arabe: "محمد صديق المنشاوي",
    style: "Al-Mus'haf Al-Mu'allim (récitation + répétition d'enfants)",
    categorie: "Mémorisation & Enfants",
    mode: "tahqiq",
    description: "Le maître récite, puis des voix d'enfants répètent. Format incontournable pour la mémorisation enfantine.",
    api_slug: "minshawi_mualim",
    everyayah: "Minshawy_Teacher_128kbps",
  },
  {
    id: "alafasy_murattal",
    nom: "Mishary Rashid Alafasy",
    nom_arabe: "مشاري راشد العفاسي",
    style: "Murattal (classique, clair et mélodieux)",
    categorie: "Révision & Écoute quotidienne",
    mode: "tartil",
    description: "Une voix contemporaine très populaire, au rythme fluide et à la diction nette. Parfaite pour la révision.",
    api_slug: "Alafasy_128kbps",
    everyayah: "Alafasy_128kbps",
  },
  {
    id: "alafasy_muallim",
    nom: "Mishary Rashid Alafasy",
    nom_arabe: "مشاري راشد العفاسي",
    style: "Mu'allim avec répétition d'enfants",
    categorie: "Mémorisation & Enfants",
    mode: "tahqiq",
    description: "La version enseignante d'Alafasy alterne sa récitation avec la reprise par des enfants.",
    api_slug: "alafasy_muallim",
    everyayah: null,
  },
  {
    id: "al_tunaiji_muallim",
    nom: "Khalifah Al-Tunaiji",
    nom_arabe: "خليفة الطنيجي",
    style: "Al-Mus'haf Al-Mu'allim (récitation + répétition d'enfants)",
    categorie: "Mémorisation & Enfants",
    mode: "tahqiq",
    description: "Version enseignante très populaire aux Émirats, avec des répétitions d'enfants claires et bien rythmées.",
    api_slug: "khalifah_al_tunaiji",
    everyayah: null,
  },
  {
    id: "yasser_dossari",
    nom: "Yasser Al-Dossari",
    nom_arabe: "ياسر الدوسري",
    style: "Murattal (Tartîl mélodieux et émouvant)",
    categorie: "Voix & Méditation",
    mode: "tartil",
    description: "Imam de la Grande Mosquée de La Mecque, à la voix douce et profondément émouvante. Parfait pour la méditation.",
    api_slug: "yasser_al_dossari",
    everyayah: "Yasser_Ad-Dussary_128kbps",
  },
  {
    id: "sudais",
    nom: "Abdul Rahman Al-Sudais",
    nom_arabe: "عبد الرحمن السديس",
    style: "Murattal (Tadwîr, rythme intermédiaire)",
    categorie: "Révision & Écoute quotidienne",
    mode: "tadwir",
    description: "Imam principal de la Grande Mosquée de La Mecque, à la récitation claire et posée, mondialement connue.",
    api_slug: "abdul_rahman_al_sudais",
    everyayah: "Abdurrahmaan_As-Sudais_192kbps",
  },
  {
    id: "ayman_suwaid_tajwid",
    nom: "Dr. Ayman Rushdi Suwaid",
    nom_arabe: "الدكتور أيمن رشدي سويد",
    style: "Tajwid appliqué (lent, avec explication des règles)",
    categorie: "Perfectionnement du Tajwid",
    mode: "tahqiq",
    description: "Docteur en sciences du Coran, il récite en démontrant précisément chaque règle de Tajwid.",
    api_slug: "ayman_suwaid",
    everyayah: "Ayman_Sowaid_64kbps",
  },
];

export const BUNDLED_RECITERS = new Set([
  "Husary_Muallim_128kbps",
  "Minshawy_Teacher_128kbps",
  "Alafasy_128kbps",
  "Ayman_Sowaid_64kbps",
  "Yasser_Ad-Dussary_128kbps",
  "Abdurrahmaan_As-Sudais_192kbps",
]);

export function ayahAudioUrl(reciter, surahNum, verseNum) {
  if (!reciter || !reciter.everyayah) return null;
  const pad = (n) => String(n).padStart(3, "0");
  const file = `${pad(surahNum)}${pad(verseNum)}.mp3`;
  if (BUNDLED_RECITERS.has(reciter.everyayah)) return `audio/${reciter.everyayah}/${file}`;
  return `https://everyayah.com/data/${reciter.everyayah}/${file}`;
}

export function styleOf(reciter) {
  return RECITATION_STYLES.find((s) => s.id === (reciter && reciter.mode)) || null;
}

// Recommandation de récitateur selon le niveau
export function reciterForLevel(level) {
  if (level === "beginner") return RECITERS.find((r) => r.id === "al_husary_muallim");
  if (level === "intermediate") return RECITERS.find((r) => r.id === "alafasy_murattal");
  if (level === "advanced") return RECITERS.find((r) => r.id === "sudais");
  return RECITERS[0];
}
