// The scenes of /parler/ (components/play/LanguagePartner.tsx), per language:
// the partners, and for each scripted scene the six expressions of its
// warm-up. Each expression serves one of the scene's two goals (`g`); the
// goal's `keys` are what the learner may say to reach it (compared after
// lib/speech-match.ts's normaliseSpoken, so accents and case don't matter).
//
// Glosses are in French and English: the other interface languages show the
// English one. `r` is a romanisation for the scripts a beginner can't read
// yet (Chinese, Arabic, Hindi).

import { MORE_SCENES, type MoreSceneId } from "./partner-scenes-more";

export type PartnerLang = "es" | "en" | "de" | "fr" | "zh" | "ar" | "hi" | "id" | "tr";
export type SceneId = BaseSceneId | MoreSceneId;
type BaseSceneId = "cafe" | "presenter" | "chemin";
export type LevelId = "a1" | "a2" | "b1" | "b2";

export interface SceneExpr {
  t: string;
  r?: string;
  fr: string;
  en: string;
  g: 0 | 1;
}

export interface SceneData {
  exprs: SceneExpr[];
  /** What the learner may say to reach goal 0 and goal 1. */
  keys: [string[], string[]];
}

export interface LangData {
  /** BCP 47 tag for recognition and the voices. */
  tag: string;
  /** Where the scene happens (in the persona of the prompt). */
  city: string;
  /** One partner per level, a1 → b2. */
  partners: [string, string, string, string];
  scenes: Record<SceneId, SceneData>;
}

export const LEVEL_IDS: LevelId[] = ["a1", "a2", "b1", "b2"];
export const SCENE_IDS: SceneId[] = ["cafe", "presenter", "chemin", "restaurant", "hotel", "telephone"];

/** Languages of the vault the partner can't speak well enough yet (shown
 *  greyed, "bientôt"), by their French name. */
export const SOON_LANGS = ["Roumain", "Malais", "Azéri", "Tamoul", "Kabyle", "Ouïghour", "Hakka", "Tok Pisin"];

const BASE: Record<PartnerLang, Omit<LangData, "scenes"> & { scenes: Record<BaseSceneId, SceneData> }> = {
  es: {
    tag: "es-ES",
    city: "Madrid",
    partners: ["Pablo", "Lucía", "Marta", "Javier"],
    scenes: {
      cafe: {
        exprs: [
          { t: "¿Me pones un café con leche?", fr: "Tu me sers un café au lait ?", en: "Can I get a white coffee?", g: 0 },
          { t: "Para tomar aquí.", fr: "Sur place.", en: "For here.", g: 0 },
          { t: "Para llevar.", fr: "À emporter.", en: "To take away.", g: 0 },
          { t: "¿Cuánto es?", fr: "Ça fait combien ?", en: "How much is it?", g: 1 },
          { t: "¿Puedo pagar con tarjeta?", fr: "Je peux payer par carte ?", en: "Can I pay by card?", g: 1 },
          { t: "Quédate con el cambio.", fr: "Garde la monnaie.", en: "Keep the change.", g: 1 },
        ],
        keys: [
          ["me pones", "quiero", "quisiera", "cafe", "para llevar", "para tomar"],
          ["cuanto", "pagar", "tarjeta", "la cuenta", "cambio"],
        ],
      },
      presenter: {
        exprs: [
          { t: "Me llamo…", fr: "Je m'appelle…", en: "My name is…", g: 0 },
          { t: "Soy de Francia.", fr: "Je viens de France.", en: "I'm from France.", g: 0 },
          { t: "Vivo en…", fr: "J'habite à…", en: "I live in…", g: 0 },
          { t: "Trabajo como…", fr: "Je travaille comme…", en: "I work as…", g: 1 },
          { t: "Soy ingeniero.", fr: "Je suis ingénieur.", en: "I'm an engineer.", g: 1 },
          { t: "¿Y tú, a qué te dedicas?", fr: "Et toi, tu fais quoi ?", en: "And you, what do you do?", g: 1 },
        ],
        keys: [
          ["me llamo", "mi nombre", "soy de", "vivo en"],
          ["trabajo", "soy ingenier", "me dedico", "estudio", "a que te dedicas"],
        ],
      },
      chemin: {
        exprs: [
          { t: "Perdona, ¿dónde está la estación?", fr: "Pardon, où est la gare ?", en: "Excuse me, where is the station?", g: 0 },
          { t: "¿Está lejos de aquí?", fr: "C'est loin d'ici ?", en: "Is it far from here?", g: 0 },
          { t: "¿Cómo llego al centro?", fr: "Comment je vais au centre ?", en: "How do I get to the centre?", g: 0 },
          { t: "¿A la derecha o a la izquierda?", fr: "À droite ou à gauche ?", en: "Right or left?", g: 1 },
          { t: "¿Todo recto?", fr: "Tout droit ?", en: "Straight on?", g: 1 },
          { t: "Muchas gracias.", fr: "Merci beaucoup.", en: "Thank you very much.", g: 1 },
        ],
        keys: [
          ["donde esta", "esta lejos", "como llego", "estacion"],
          ["derecha", "izquierda", "recto", "gracias"],
        ],
      },
    },
  },
  en: {
    tag: "en-GB",
    city: "London",
    partners: ["Tom", "Emma", "Olivia", "James"],
    scenes: {
      cafe: {
        exprs: [
          { t: "Could I have a white coffee, please?", fr: "Je pourrais avoir un café au lait ?", en: "Could I have a white coffee, please?", g: 0 },
          { t: "For here, please.", fr: "Sur place, s'il vous plaît.", en: "For here, please.", g: 0 },
          { t: "To take away.", fr: "À emporter.", en: "To take away.", g: 0 },
          { t: "How much is it?", fr: "Ça fait combien ?", en: "How much is it?", g: 1 },
          { t: "Can I pay by card?", fr: "Je peux payer par carte ?", en: "Can I pay by card?", g: 1 },
          { t: "Keep the change.", fr: "Gardez la monnaie.", en: "Keep the change.", g: 1 },
        ],
        keys: [
          ["could i have", "can i have", "i would like", "i d like", "coffee", "tea", "for here", "take away", "to go"],
          ["how much", "pay", "card", "change", "the bill"],
        ],
      },
      presenter: {
        exprs: [
          { t: "My name is…", fr: "Je m'appelle…", en: "My name is…", g: 0 },
          { t: "I'm from France.", fr: "Je viens de France.", en: "I'm from France.", g: 0 },
          { t: "I live in…", fr: "J'habite à…", en: "I live in…", g: 0 },
          { t: "I work as…", fr: "Je travaille comme…", en: "I work as…", g: 1 },
          { t: "I'm an engineer.", fr: "Je suis ingénieur.", en: "I'm an engineer.", g: 1 },
          { t: "What do you do?", fr: "Et vous, vous faites quoi ?", en: "What do you do?", g: 1 },
        ],
        keys: [
          ["my name", "i m from", "i am from", "i live"],
          ["i work", "engineer", "what do you do", "i study"],
        ],
      },
      chemin: {
        exprs: [
          { t: "Excuse me, where is the station?", fr: "Pardon, où est la gare ?", en: "Excuse me, where is the station?", g: 0 },
          { t: "Is it far from here?", fr: "C'est loin d'ici ?", en: "Is it far from here?", g: 0 },
          { t: "How do I get to the centre?", fr: "Comment je vais au centre ?", en: "How do I get to the centre?", g: 0 },
          { t: "Left or right?", fr: "À gauche ou à droite ?", en: "Left or right?", g: 1 },
          { t: "Straight ahead?", fr: "Tout droit ?", en: "Straight ahead?", g: 1 },
          { t: "Thank you very much.", fr: "Merci beaucoup.", en: "Thank you very much.", g: 1 },
        ],
        keys: [
          ["where is", "is it far", "how do i get", "station"],
          ["left", "right", "straight", "thank"],
        ],
      },
    },
  },
  de: {
    tag: "de-DE",
    city: "Berlin",
    partners: ["Jonas", "Lena", "Anna", "Felix"],
    scenes: {
      cafe: {
        exprs: [
          { t: "Ich hätte gern einen Milchkaffee.", fr: "Je voudrais un café au lait.", en: "I'd like a white coffee.", g: 0 },
          { t: "Für hier, bitte.", fr: "Sur place, s'il vous plaît.", en: "For here, please.", g: 0 },
          { t: "Zum Mitnehmen.", fr: "À emporter.", en: "To take away.", g: 0 },
          { t: "Was macht das?", fr: "Ça fait combien ?", en: "How much is that?", g: 1 },
          { t: "Kann ich mit Karte zahlen?", fr: "Je peux payer par carte ?", en: "Can I pay by card?", g: 1 },
          { t: "Stimmt so.", fr: "Gardez la monnaie.", en: "Keep the change.", g: 1 },
        ],
        keys: [
          ["hatte gern", "mochte", "kaffee", "fur hier", "mitnehmen"],
          ["was macht", "zahlen", "karte", "stimmt so", "kostet"],
        ],
      },
      presenter: {
        exprs: [
          { t: "Ich heiße…", fr: "Je m'appelle…", en: "My name is…", g: 0 },
          { t: "Ich komme aus Frankreich.", fr: "Je viens de France.", en: "I'm from France.", g: 0 },
          { t: "Ich wohne in…", fr: "J'habite à…", en: "I live in…", g: 0 },
          { t: "Ich arbeite als…", fr: "Je travaille comme…", en: "I work as…", g: 1 },
          { t: "Ich bin Ingenieur.", fr: "Je suis ingénieur.", en: "I'm an engineer.", g: 1 },
          { t: "Und was machst du beruflich?", fr: "Et toi, tu fais quoi ?", en: "And what do you do for work?", g: 1 },
        ],
        keys: [
          ["ich heiße", "mein name", "ich komme aus", "ich wohne"],
          ["ich arbeite", "ingenieur", "beruflich", "ich studiere"],
        ],
      },
      chemin: {
        exprs: [
          { t: "Entschuldigung, wo ist der Bahnhof?", fr: "Pardon, où est la gare ?", en: "Excuse me, where is the station?", g: 0 },
          { t: "Ist das weit von hier?", fr: "C'est loin d'ici ?", en: "Is it far from here?", g: 0 },
          { t: "Wie komme ich ins Zentrum?", fr: "Comment je vais au centre ?", en: "How do I get to the centre?", g: 0 },
          { t: "Links oder rechts?", fr: "À gauche ou à droite ?", en: "Left or right?", g: 1 },
          { t: "Immer geradeaus?", fr: "Tout droit ?", en: "Straight on?", g: 1 },
          { t: "Vielen Dank.", fr: "Merci beaucoup.", en: "Thank you very much.", g: 1 },
        ],
        keys: [
          ["wo ist", "weit", "wie komme", "bahnhof"],
          ["links", "rechts", "geradeaus", "dank"],
        ],
      },
    },
  },
  fr: {
    tag: "fr-FR",
    city: "Lyon",
    partners: ["Léo", "Camille", "Chloé", "Hugo"],
    scenes: {
      cafe: {
        exprs: [
          { t: "Je voudrais un café crème, s'il vous plaît.", fr: "Je voudrais un café crème, s'il vous plaît.", en: "I'd like a white coffee, please.", g: 0 },
          { t: "Sur place.", fr: "Sur place.", en: "For here.", g: 0 },
          { t: "À emporter.", fr: "À emporter.", en: "To take away.", g: 0 },
          { t: "Ça fait combien ?", fr: "Ça fait combien ?", en: "How much is it?", g: 1 },
          { t: "Je peux payer par carte ?", fr: "Je peux payer par carte ?", en: "Can I pay by card?", g: 1 },
          { t: "Gardez la monnaie.", fr: "Gardez la monnaie.", en: "Keep the change.", g: 1 },
        ],
        keys: [
          ["je voudrais", "je prends", "cafe", "sur place", "emporter"],
          ["combien", "payer", "carte", "monnaie", "addition"],
        ],
      },
      presenter: {
        exprs: [
          { t: "Je m'appelle…", fr: "Je m'appelle…", en: "My name is…", g: 0 },
          { t: "Je viens d'Angleterre.", fr: "Je viens d'Angleterre.", en: "I'm from England.", g: 0 },
          { t: "J'habite à…", fr: "J'habite à…", en: "I live in…", g: 0 },
          { t: "Je travaille comme…", fr: "Je travaille comme…", en: "I work as…", g: 1 },
          { t: "Je suis ingénieur.", fr: "Je suis ingénieur.", en: "I'm an engineer.", g: 1 },
          { t: "Et vous, vous faites quoi ?", fr: "Et vous, vous faites quoi ?", en: "And you, what do you do?", g: 1 },
        ],
        keys: [
          ["je m appelle", "je viens", "j habite"],
          ["je travaille", "ingenieur", "vous faites quoi", "je suis etudiant"],
        ],
      },
      chemin: {
        exprs: [
          { t: "Pardon, où est la gare ?", fr: "Pardon, où est la gare ?", en: "Excuse me, where is the station?", g: 0 },
          { t: "C'est loin d'ici ?", fr: "C'est loin d'ici ?", en: "Is it far from here?", g: 0 },
          { t: "Comment je vais au centre ?", fr: "Comment je vais au centre ?", en: "How do I get to the centre?", g: 0 },
          { t: "À droite ou à gauche ?", fr: "À droite ou à gauche ?", en: "Right or left?", g: 1 },
          { t: "Tout droit ?", fr: "Tout droit ?", en: "Straight on?", g: 1 },
          { t: "Merci beaucoup.", fr: "Merci beaucoup.", en: "Thank you very much.", g: 1 },
        ],
        keys: [
          ["ou est", "loin", "comment je vais", "gare"],
          ["droite", "gauche", "tout droit", "merci"],
        ],
      },
    },
  },
  zh: {
    tag: "zh-CN",
    city: "北京",
    partners: ["Xiaoming", "Li Hua", "Wang Fang", "Chen Wei"],
    scenes: {
      cafe: {
        exprs: [
          { t: "我要一杯拿铁。", r: "wǒ yào yì bēi nátiě", fr: "Je voudrais un latte.", en: "I'd like a latte.", g: 0 },
          { t: "在这儿喝。", r: "zài zhèr hē", fr: "Sur place.", en: "For here.", g: 0 },
          { t: "带走。", r: "dài zǒu", fr: "À emporter.", en: "To take away.", g: 0 },
          { t: "多少钱？", r: "duōshao qián", fr: "Combien ça coûte ?", en: "How much is it?", g: 1 },
          { t: "可以刷卡吗？", r: "kěyǐ shuā kǎ ma", fr: "Je peux payer par carte ?", en: "Can I pay by card?", g: 1 },
          { t: "可以用微信付吗？", r: "kěyǐ yòng Wēixìn fù ma", fr: "Je peux payer avec WeChat ?", en: "Can I pay with WeChat?", g: 1 },
        ],
        keys: [
          ["我要", "一杯", "拿铁", "咖啡", "这儿喝", "带走"],
          ["多少钱", "刷卡", "微信", "付"],
        ],
      },
      presenter: {
        exprs: [
          { t: "我叫……", r: "wǒ jiào…", fr: "Je m'appelle…", en: "My name is…", g: 0 },
          { t: "我是法国人。", r: "wǒ shì Fǎguó rén", fr: "Je suis français.", en: "I'm French.", g: 0 },
          { t: "我住在……", r: "wǒ zhù zài…", fr: "J'habite à…", en: "I live in…", g: 0 },
          { t: "我是工程师。", r: "wǒ shì gōngchéngshī", fr: "Je suis ingénieur.", en: "I'm an engineer.", g: 1 },
          { t: "我在公司工作。", r: "wǒ zài gōngsī gōngzuò", fr: "Je travaille dans une entreprise.", en: "I work at a company.", g: 1 },
          { t: "你做什么工作？", r: "nǐ zuò shénme gōngzuò", fr: "Tu fais quoi comme travail ?", en: "What do you do for work?", g: 1 },
        ],
        keys: [
          ["我叫", "法国", "我住"],
          ["工程师", "工作", "学生"],
        ],
      },
      chemin: {
        exprs: [
          { t: "请问，火车站在哪儿？", r: "qǐngwèn, huǒchēzhàn zài nǎr", fr: "Pardon, où est la gare ?", en: "Excuse me, where is the station?", g: 0 },
          { t: "远吗？", r: "yuǎn ma", fr: "C'est loin ?", en: "Is it far?", g: 0 },
          { t: "怎么去市中心？", r: "zěnme qù shì zhōngxīn", fr: "Comment aller au centre ?", en: "How do I get to the centre?", g: 0 },
          { t: "往左还是往右？", r: "wǎng zuǒ háishi wǎng yòu", fr: "À gauche ou à droite ?", en: "Left or right?", g: 1 },
          { t: "一直走吗？", r: "yìzhí zǒu ma", fr: "Tout droit ?", en: "Straight on?", g: 1 },
          { t: "谢谢！", r: "xièxie", fr: "Merci !", en: "Thank you!", g: 1 },
        ],
        keys: [
          ["在哪", "远吗", "怎么去", "火车站"],
          ["左", "右", "一直", "谢谢"],
        ],
      },
    },
  },
  // Lebanese Arabic, as spoken in Beirut (the vault's "Arabe/Libanais"),
  // not Modern Standard Arabic: what a learner actually says at a café there.
  ar: {
    tag: "ar-LB",
    city: "بيروت",
    partners: ["Karim", "Rima", "Nour", "Ziad"],
    scenes: {
      cafe: {
        exprs: [
          { t: "بدّي فنجان قهوة مع حليب، إذا بتريد.", r: "baddi finjēn ahwe maʿ ḥalīb, iza btrīd", fr: "Je voudrais un café au lait, s'il te plaît.", en: "I'd like a white coffee, please.", g: 0 },
          { t: "هون، إذا بتريد.", r: "hōn, iza btrīd", fr: "Sur place, s'il te plaît.", en: "For here, please.", g: 0 },
          { t: "بدّي آخدها معي.", r: "baddi ēkhida maʿi", fr: "Je l'emporte.", en: "I'll take it with me.", g: 0 },
          { t: "قدّيش الحساب؟", r: "addēsh el-ḥsēb", fr: "Combien je dois ?", en: "How much is the bill?", g: 1 },
          { t: "فيني إدفع بالكارت؟", r: "fīni idfaʿ bil-kart", fr: "Je peux payer par carte ?", en: "Can I pay by card?", g: 1 },
          { t: "خلّي الباقي إلك.", r: "khalli l-bēʾi elak", fr: "Garde la monnaie.", en: "Keep the change.", g: 1 },
        ],
        keys: [
          ["بدي", "قهوة", "شاي", "هون", "معي"],
          ["قديش", "الحساب", "ادفع", "الكارت", "الباقي", "خلي"],
        ],
      },
      presenter: {
        exprs: [
          { t: "إسمي…", r: "ismi…", fr: "Je m'appelle…", en: "My name is…", g: 0 },
          { t: "أنا من فرنسا.", r: "ana min Faransa", fr: "Je viens de France.", en: "I'm from France.", g: 0 },
          { t: "ساكن بـ…", r: "sēken b-…", fr: "J'habite à…", en: "I live in…", g: 0 },
          { t: "بشتغل مهندس.", r: "bishtighil muhandis", fr: "Je travaille comme ingénieur.", en: "I work as an engineer.", g: 1 },
          { t: "أنا طالب.", r: "ana ṭāleb", fr: "Je suis étudiant.", en: "I'm a student.", g: 1 },
          { t: "وإنت، شو بتشتغل؟", r: "w enta, shu btishtighil", fr: "Et toi, tu fais quoi ?", en: "And you, what do you do?", g: 1 },
        ],
        keys: [
          ["اسمي", "انا من", "ساكن"],
          ["بشتغل", "مهندس", "طالب", "شو بتشتغل"],
        ],
      },
      chemin: {
        exprs: [
          { t: "لو سمحت، وين المحطة؟", r: "law samaḥt, wēn el-maḥaṭṭa", fr: "Pardon, où est la gare ?", en: "Excuse me, where is the station?", g: 0 },
          { t: "بعيدة من هون؟", r: "baʿīde min hōn", fr: "C'est loin d'ici ?", en: "Is it far from here?", g: 0 },
          { t: "كيف بوصل عالبلد؟", r: "kīf bōṣal ʿal-balad", fr: "Comment je vais au centre-ville ?", en: "How do I get to the city centre?", g: 0 },
          { t: "عاليمين ولّا عالشمال؟", r: "ʿal-yamīn walla ʿash-shmēl", fr: "À droite ou à gauche ?", en: "Right or left?", g: 1 },
          { t: "دغري؟", r: "dighri", fr: "Tout droit ?", en: "Straight ahead?", g: 1 },
          { t: "ميرسي كتير.", r: "merci ktīr", fr: "Merci beaucoup.", en: "Thank you very much.", g: 1 },
        ],
        keys: [
          ["وين", "بعيدة", "كيف بوصل", "المحطة"],
          ["عاليمين", "عالشمال", "اليمين", "الشمال", "دغري", "ميرسي", "شكرا"],
        ],
      },
    },
  },
  hi: {
    tag: "hi-IN",
    city: "दिल्ली",
    partners: ["Arjun", "Priya", "Ananya", "Rohan"],
    scenes: {
      cafe: {
        exprs: [
          { t: "मुझे एक कॉफ़ी चाहिए।", r: "mujhe ek kŏfī cāhie", fr: "Je voudrais un café.", en: "I'd like a coffee.", g: 0 },
          { t: "यहीं पिऊँगा।", r: "yahīṁ piūṁgā", fr: "Je le bois ici.", en: "I'll drink it here.", g: 0 },
          { t: "पैक कर दीजिए।", r: "paik kar dījie", fr: "À emporter, s'il vous plaît.", en: "To take away, please.", g: 0 },
          { t: "कितने पैसे हुए?", r: "kitne paise hue", fr: "Ça fait combien ?", en: "How much is it?", g: 1 },
          { t: "क्या मैं कार्ड से पे कर सकता हूँ?", r: "kyā maiṁ kārḍ se pe kar saktā hūṁ", fr: "Je peux payer par carte ?", en: "Can I pay by card?", g: 1 },
          { t: "बाक़ी रख लीजिए।", r: "bāqī rakh lījie", fr: "Gardez la monnaie.", en: "Keep the change.", g: 1 },
        ],
        keys: [
          ["चाहिए", "कॉफ़ी", "कॉफी", "चाय", "यहीं", "पैक"],
          ["कितने", "पैसे", "कार्ड", "बाक़ी", "बाकी"],
        ],
      },
      presenter: {
        exprs: [
          { t: "मेरा नाम … है।", r: "merā nām … hai", fr: "Je m'appelle…", en: "My name is…", g: 0 },
          { t: "मैं फ़्रांस से हूँ।", r: "maiṁ frāṁs se hūṁ", fr: "Je viens de France.", en: "I'm from France.", g: 0 },
          { t: "मैं … में रहता हूँ।", r: "maiṁ … meṁ rahtā hūṁ", fr: "J'habite à…", en: "I live in…", g: 0 },
          { t: "मैं इंजीनियर हूँ।", r: "maiṁ iṁjīniyar hūṁ", fr: "Je suis ingénieur.", en: "I'm an engineer.", g: 1 },
          { t: "मैं एक कंपनी में काम करता हूँ।", r: "maiṁ ek kampanī meṁ kām kartā hūṁ", fr: "Je travaille dans une entreprise.", en: "I work at a company.", g: 1 },
          { t: "आप क्या करते हैं?", r: "āp kyā karte haiṁ", fr: "Et vous, vous faites quoi ?", en: "What do you do?", g: 1 },
        ],
        keys: [
          ["मेरा नाम", "से हूँ", "रहता", "रहती"],
          ["इंजीनियर", "काम", "क्या करते", "छात्र"],
        ],
      },
      chemin: {
        exprs: [
          { t: "माफ़ कीजिए, रेलवे स्टेशन कहाँ है?", r: "māf kījie, relve sṭeśan kahāṁ hai", fr: "Pardon, où est la gare ?", en: "Excuse me, where is the station?", g: 0 },
          { t: "क्या यह यहाँ से दूर है?", r: "kyā yah yahāṁ se dūr hai", fr: "C'est loin d'ici ?", en: "Is it far from here?", g: 0 },
          { t: "शहर के बीच कैसे जाऊँ?", r: "śahar ke bīc kaise jāūṁ", fr: "Comment je vais au centre ?", en: "How do I get to the centre?", g: 0 },
          { t: "दाएँ या बाएँ?", r: "dāeṁ yā bāeṁ", fr: "À droite ou à gauche ?", en: "Right or left?", g: 1 },
          { t: "सीधे?", r: "sīdhe", fr: "Tout droit ?", en: "Straight on?", g: 1 },
          { t: "बहुत धन्यवाद।", r: "bahut dhanyavād", fr: "Merci beaucoup.", en: "Thank you very much.", g: 1 },
        ],
        keys: [
          ["कहाँ", "दूर", "कैसे जाऊँ", "स्टेशन"],
          ["दाएँ", "बाएँ", "सीधे", "धन्यवाद", "शुक्रिया"],
        ],
      },
    },
  },
  id: {
    tag: "id-ID",
    city: "Jakarta",
    partners: ["Budi", "Sari", "Dewi", "Rizky"],
    scenes: {
      cafe: {
        exprs: [
          { t: "Saya mau kopi susu satu.", fr: "Je voudrais un café au lait.", en: "I'd like one white coffee.", g: 0 },
          { t: "Minum di sini.", fr: "Sur place.", en: "For here.", g: 0 },
          { t: "Dibungkus, ya.", fr: "À emporter.", en: "To take away.", g: 0 },
          { t: "Berapa semuanya?", fr: "Ça fait combien en tout ?", en: "How much altogether?", g: 1 },
          { t: "Bisa bayar pakai kartu?", fr: "Je peux payer par carte ?", en: "Can I pay by card?", g: 1 },
          { t: "Ambil saja kembaliannya.", fr: "Gardez la monnaie.", en: "Keep the change.", g: 1 },
        ],
        keys: [
          ["saya mau", "pesan", "kopi", "teh", "di sini", "dibungkus"],
          ["berapa", "bayar", "kartu", "kembalian"],
        ],
      },
      presenter: {
        exprs: [
          { t: "Nama saya…", fr: "Je m'appelle…", en: "My name is…", g: 0 },
          { t: "Saya dari Prancis.", fr: "Je viens de France.", en: "I'm from France.", g: 0 },
          { t: "Saya tinggal di…", fr: "J'habite à…", en: "I live in…", g: 0 },
          { t: "Saya bekerja sebagai…", fr: "Je travaille comme…", en: "I work as…", g: 1 },
          { t: "Saya insinyur.", fr: "Je suis ingénieur.", en: "I'm an engineer.", g: 1 },
          { t: "Kalau kamu, kerja apa?", fr: "Et toi, tu fais quoi ?", en: "And you, what do you do?", g: 1 },
        ],
        keys: [
          ["nama saya", "saya dari", "tinggal di"],
          ["bekerja", "insinyur", "kerja apa", "mahasiswa"],
        ],
      },
      chemin: {
        exprs: [
          { t: "Permisi, stasiun di mana?", fr: "Pardon, où est la gare ?", en: "Excuse me, where is the station?", g: 0 },
          { t: "Jauh dari sini?", fr: "C'est loin d'ici ?", en: "Is it far from here?", g: 0 },
          { t: "Bagaimana ke pusat kota?", fr: "Comment je vais au centre ?", en: "How do I get to the centre?", g: 0 },
          { t: "Ke kiri atau ke kanan?", fr: "À gauche ou à droite ?", en: "Left or right?", g: 1 },
          { t: "Lurus saja?", fr: "Tout droit ?", en: "Straight on?", g: 1 },
          { t: "Terima kasih banyak.", fr: "Merci beaucoup.", en: "Thank you very much.", g: 1 },
        ],
        keys: [
          ["di mana", "jauh", "bagaimana ke", "stasiun"],
          ["kiri", "kanan", "lurus", "terima kasih"],
        ],
      },
    },
  },
  tr: {
    tag: "tr-TR",
    city: "İstanbul",
    partners: ["Emre", "Elif", "Zeynep", "Mehmet"],
    scenes: {
      cafe: {
        exprs: [
          { t: "Bir sütlü kahve alabilir miyim?", fr: "Je peux avoir un café au lait ?", en: "Can I have a white coffee?", g: 0 },
          { t: "Burada içeceğim.", fr: "Je le bois ici.", en: "I'll drink it here.", g: 0 },
          { t: "Paket olsun.", fr: "À emporter.", en: "To take away.", g: 0 },
          { t: "Ne kadar?", fr: "Combien ?", en: "How much?", g: 1 },
          { t: "Kartla ödeyebilir miyim?", fr: "Je peux payer par carte ?", en: "Can I pay by card?", g: 1 },
          { t: "Üstü kalsın.", fr: "Gardez la monnaie.", en: "Keep the change.", g: 1 },
        ],
        keys: [
          ["alabilir miyim", "istiyorum", "kahve", "çay", "burada", "paket"],
          ["ne kadar", "ödeyebilir", "kart", "üstü kalsın", "hesap"],
        ],
      },
      presenter: {
        exprs: [
          { t: "Benim adım…", fr: "Je m'appelle…", en: "My name is…", g: 0 },
          { t: "Fransalıyım.", fr: "Je suis français.", en: "I'm French.", g: 0 },
          { t: "…'da yaşıyorum.", fr: "J'habite à…", en: "I live in…", g: 0 },
          { t: "Mühendis olarak çalışıyorum.", fr: "Je travaille comme ingénieur.", en: "I work as an engineer.", g: 1 },
          { t: "Öğrenciyim.", fr: "Je suis étudiant.", en: "I'm a student.", g: 1 },
          { t: "Sen ne iş yapıyorsun?", fr: "Et toi, tu fais quoi ?", en: "And what do you do?", g: 1 },
        ],
        keys: [
          ["adım", "fransalı", "yaşıyorum"],
          ["mühendis", "çalışıyorum", "öğrenci", "ne iş"],
        ],
      },
      chemin: {
        exprs: [
          { t: "Affedersiniz, istasyon nerede?", fr: "Pardon, où est la gare ?", en: "Excuse me, where is the station?", g: 0 },
          { t: "Buradan uzak mı?", fr: "C'est loin d'ici ?", en: "Is it far from here?", g: 0 },
          { t: "Merkeze nasıl giderim?", fr: "Comment je vais au centre ?", en: "How do I get to the centre?", g: 0 },
          { t: "Sağa mı, sola mı?", fr: "À droite ou à gauche ?", en: "Right or left?", g: 1 },
          { t: "Dümdüz mü?", fr: "Tout droit ?", en: "Straight on?", g: 1 },
          { t: "Çok teşekkürler.", fr: "Merci beaucoup.", en: "Thank you very much.", g: 1 },
        ],
        keys: [
          ["nerede", "uzak", "nasıl giderim", "istasyon"],
          ["sağa", "sola", "dümdüz", "teşekkür", "sağ ol"],
        ],
      },
    },
  },
};

export const PARTNER_DATA = Object.fromEntries(
  (Object.keys(BASE) as PartnerLang[]).map((l) => [l, { ...BASE[l], scenes: { ...BASE[l].scenes, ...MORE_SCENES[l] } }]),
) as Record<PartnerLang, LangData>;

export const PARTNER_LANGS = Object.keys(PARTNER_DATA) as PartnerLang[];

/** The vault folder of each language ("Languages - Dialects/<name>"), for the
 *  link to its "Communication" notes. */
export const VAULT_FOLDER: Record<PartnerLang, string> = {
  es: "Espagnol",
  en: "Anglais",
  de: "Allemand",
  fr: "",
  zh: "Mandarin",
  ar: "Arabe/Libanais",
  hi: "Hindi",
  id: "Indonésien",
  tr: "Turc",
};
