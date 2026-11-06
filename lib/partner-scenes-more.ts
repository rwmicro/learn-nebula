// The second set of scenes of /parler/ (restaurant, hotel, phone call), per
// language, in the shape of lib/partner-scenes.ts (which merges them in).
// Same rules: six expressions, each serving one of the two goals (`g`), and
// keys matched at the start of a word after normaliseSpoken (anywhere in the
// line for Chinese). lib/partner.test.ts checks that each goal's first
// expression reaches it.

import type { PartnerLang, SceneData } from "./partner-scenes";

export type MoreSceneId = "restaurant" | "hotel" | "telephone";

export const MORE_SCENES: Record<PartnerLang, Record<MoreSceneId, SceneData>> = {
  es: {
    restaurant: {
      exprs: [
        { t: "Una mesa para dos, por favor.", fr: "Une table pour deux, s'il vous plaît.", en: "A table for two, please.", g: 0 },
        { t: "¿Qué me recomienda?", fr: "Que me conseillez-vous ?", en: "What do you recommend?", g: 0 },
        { t: "De primero, una ensalada.", fr: "En entrée, une salade.", en: "A salad to start.", g: 0 },
        { t: "La cuenta, por favor.", fr: "L'addition, s'il vous plaît.", en: "The bill, please.", g: 1 },
        { t: "Estaba todo muy rico.", fr: "Tout était délicieux.", en: "It was all delicious.", g: 1 },
        { t: "¿Está incluido el servicio?", fr: "Le service est compris ?", en: "Is service included?", g: 1 },
      ],
      keys: [
        ["una mesa", "recomienda", "de primero", "quiero", "para mi"],
        ["la cuenta", "muy rico", "servicio", "pagar"],
      ],
    },
    hotel: {
      exprs: [
        { t: "Tengo una reserva a nombre de…", fr: "J'ai une réservation au nom de…", en: "I have a booking under the name…", g: 0 },
        { t: "¿Tiene una habitación libre?", fr: "Vous avez une chambre libre ?", en: "Do you have a free room?", g: 0 },
        { t: "Para tres noches.", fr: "Pour trois nuits.", en: "For three nights.", g: 0 },
        { t: "¿A qué hora es el desayuno?", fr: "Le petit-déjeuner est à quelle heure ?", en: "What time is breakfast?", g: 1 },
        { t: "¿Cuál es la contraseña del wifi?", fr: "Quel est le mot de passe du wifi ?", en: "What's the wifi password?", g: 1 },
        { t: "¿Hasta qué hora hay que dejar la habitación?", fr: "Jusqu'à quelle heure faut-il libérer la chambre ?", en: "When is check-out?", g: 1 },
      ],
      keys: [
        ["reserva", "habitacion", "noches", "a nombre"],
        ["desayuno", "wifi", "contrasena", "dejar la"],
      ],
    },
    telephone: {
      exprs: [
        { t: "Hola, ¿puedo hablar con…?", fr: "Bonjour, je peux parler à… ?", en: "Hello, may I speak to…?", g: 0 },
        { t: "Llamo de parte de…", fr: "J'appelle de la part de…", en: "I'm calling on behalf of…", g: 0 },
        { t: "¿Puede repetir, por favor?", fr: "Vous pouvez répéter, s'il vous plaît ?", en: "Could you repeat, please?", g: 0 },
        { t: "Quería pedir una cita.", fr: "Je voulais prendre rendez-vous.", en: "I'd like to make an appointment.", g: 1 },
        { t: "¿El martes le va bien?", fr: "Mardi, ça vous va ?", en: "Does Tuesday suit you?", g: 1 },
        { t: "Perfecto, hasta el martes.", fr: "Parfait, à mardi.", en: "Perfect, see you on Tuesday.", g: 1 },
      ],
      keys: [
        ["puedo hablar", "llamo", "de parte", "repetir"],
        ["una cita", "martes", "le va bien", "hasta el"],
      ],
    },
  },
  en: {
    restaurant: {
      exprs: [
        { t: "A table for two, please.", fr: "Une table pour deux, s'il vous plaît.", en: "A table for two, please.", g: 0 },
        { t: "What would you recommend?", fr: "Que me conseillez-vous ?", en: "What would you recommend?", g: 0 },
        { t: "I'll have the fish, please.", fr: "Je vais prendre le poisson.", en: "I'll have the fish, please.", g: 0 },
        { t: "Could we have the bill, please?", fr: "On pourrait avoir l'addition ?", en: "Could we have the bill, please?", g: 1 },
        { t: "That was lovely, thank you.", fr: "C'était délicieux, merci.", en: "That was lovely, thank you.", g: 1 },
        { t: "Is service included?", fr: "Le service est compris ?", en: "Is service included?", g: 1 },
      ],
      keys: [
        ["a table", "recommend", "i ll have", "i d like"],
        ["the bill", "the check", "lovely", "service", "pay"],
      ],
    },
    hotel: {
      exprs: [
        { t: "I have a booking under the name…", fr: "J'ai une réservation au nom de…", en: "I have a booking under the name…", g: 0 },
        { t: "Do you have a room for tonight?", fr: "Vous avez une chambre pour ce soir ?", en: "Do you have a room for tonight?", g: 0 },
        { t: "For three nights.", fr: "Pour trois nuits.", en: "For three nights.", g: 0 },
        { t: "What time is breakfast?", fr: "Le petit-déjeuner est à quelle heure ?", en: "What time is breakfast?", g: 1 },
        { t: "What's the wifi password?", fr: "Quel est le mot de passe du wifi ?", en: "What's the wifi password?", g: 1 },
        { t: "When do I need to check out?", fr: "À quelle heure faut-il partir ?", en: "When do I need to check out?", g: 1 },
      ],
      keys: [
        ["booking", "reservation", "a room", "nights"],
        ["breakfast", "wifi", "password", "check out"],
      ],
    },
    telephone: {
      exprs: [
        { t: "Hello, could I speak to…?", fr: "Bonjour, je pourrais parler à… ?", en: "Hello, could I speak to…?", g: 0 },
        { t: "I'm calling about…", fr: "J'appelle au sujet de…", en: "I'm calling about…", g: 0 },
        { t: "Sorry, could you say that again?", fr: "Pardon, vous pouvez répéter ?", en: "Sorry, could you say that again?", g: 0 },
        { t: "I'd like to make an appointment.", fr: "Je voudrais prendre rendez-vous.", en: "I'd like to make an appointment.", g: 1 },
        { t: "Is Tuesday all right?", fr: "Mardi, ça va ?", en: "Is Tuesday all right?", g: 1 },
        { t: "Great, see you on Tuesday.", fr: "Parfait, à mardi.", en: "Great, see you on Tuesday.", g: 1 },
      ],
      keys: [
        ["speak to", "calling", "say that again", "repeat"],
        ["appointment", "tuesday", "see you", "all right"],
      ],
    },
  },
  de: {
    restaurant: {
      exprs: [
        { t: "Einen Tisch für zwei, bitte.", fr: "Une table pour deux, s'il vous plaît.", en: "A table for two, please.", g: 0 },
        { t: "Was empfehlen Sie?", fr: "Que me conseillez-vous ?", en: "What do you recommend?", g: 0 },
        { t: "Ich nehme das Schnitzel.", fr: "Je prends l'escalope.", en: "I'll have the schnitzel.", g: 0 },
        { t: "Die Rechnung, bitte.", fr: "L'addition, s'il vous plaît.", en: "The bill, please.", g: 1 },
        { t: "Es hat sehr gut geschmeckt.", fr: "C'était très bon.", en: "It was very good.", g: 1 },
        { t: "Zusammen oder getrennt?", fr: "Ensemble ou séparément ?", en: "Together or separately?", g: 1 },
      ],
      keys: [
        ["einen tisch", "empfehlen", "ich nehme", "ich mochte"],
        ["rechnung", "geschmeckt", "zusammen", "getrennt", "zahlen"],
      ],
    },
    hotel: {
      exprs: [
        { t: "Ich habe eine Reservierung auf den Namen…", fr: "J'ai une réservation au nom de…", en: "I have a booking under the name…", g: 0 },
        { t: "Haben Sie ein Zimmer frei?", fr: "Vous avez une chambre libre ?", en: "Do you have a room free?", g: 0 },
        { t: "Für drei Nächte.", fr: "Pour trois nuits.", en: "For three nights.", g: 0 },
        { t: "Wann gibt es Frühstück?", fr: "Le petit-déjeuner est quand ?", en: "When is breakfast?", g: 1 },
        { t: "Wie ist das WLAN-Passwort?", fr: "Quel est le mot de passe du wifi ?", en: "What's the wifi password?", g: 1 },
        { t: "Bis wann muss ich auschecken?", fr: "Jusqu'à quand dois-je libérer la chambre ?", en: "When do I have to check out?", g: 1 },
      ],
      keys: [
        ["reservierung", "zimmer", "nachte", "auf den namen"],
        ["fruhstuck", "wlan", "passwort", "auschecken"],
      ],
    },
    telephone: {
      exprs: [
        { t: "Guten Tag, kann ich bitte mit … sprechen?", fr: "Bonjour, je peux parler à… ?", en: "Hello, may I speak to…?", g: 0 },
        { t: "Ich rufe wegen … an.", fr: "J'appelle au sujet de…", en: "I'm calling about…", g: 0 },
        { t: "Können Sie das bitte wiederholen?", fr: "Vous pouvez répéter, s'il vous plaît ?", en: "Could you repeat that, please?", g: 0 },
        { t: "Ich möchte einen Termin vereinbaren.", fr: "Je voudrais prendre rendez-vous.", en: "I'd like to make an appointment.", g: 1 },
        { t: "Passt Ihnen Dienstag?", fr: "Mardi, ça vous va ?", en: "Does Tuesday suit you?", g: 1 },
        { t: "Gut, bis Dienstag.", fr: "Bien, à mardi.", en: "Good, see you Tuesday.", g: 1 },
      ],
      keys: [
        ["kann ich", "sprechen", "ich rufe", "wiederholen"],
        ["termin", "dienstag", "passt", "bis"],
      ],
    },
  },
  fr: {
    restaurant: {
      exprs: [
        { t: "Une table pour deux, s'il vous plaît.", fr: "Une table pour deux, s'il vous plaît.", en: "A table for two, please.", g: 0 },
        { t: "Qu'est-ce que vous me conseillez ?", fr: "Qu'est-ce que vous me conseillez ?", en: "What do you recommend?", g: 0 },
        { t: "Je vais prendre le plat du jour.", fr: "Je vais prendre le plat du jour.", en: "I'll have the dish of the day.", g: 0 },
        { t: "L'addition, s'il vous plaît.", fr: "L'addition, s'il vous plaît.", en: "The bill, please.", g: 1 },
        { t: "C'était délicieux.", fr: "C'était délicieux.", en: "It was delicious.", g: 1 },
        { t: "Je peux payer par carte ?", fr: "Je peux payer par carte ?", en: "Can I pay by card?", g: 1 },
      ],
      keys: [
        ["une table", "conseillez", "je vais prendre", "je voudrais"],
        ["l addition", "addition", "delicieux", "payer"],
      ],
    },
    hotel: {
      exprs: [
        { t: "J'ai une réservation au nom de…", fr: "J'ai une réservation au nom de…", en: "I have a booking under the name…", g: 0 },
        { t: "Vous avez une chambre libre ?", fr: "Vous avez une chambre libre ?", en: "Do you have a free room?", g: 0 },
        { t: "Pour trois nuits.", fr: "Pour trois nuits.", en: "For three nights.", g: 0 },
        { t: "Le petit-déjeuner est à quelle heure ?", fr: "Le petit-déjeuner est à quelle heure ?", en: "What time is breakfast?", g: 1 },
        { t: "Quel est le code du wifi ?", fr: "Quel est le code du wifi ?", en: "What's the wifi code?", g: 1 },
        { t: "Il faut libérer la chambre à quelle heure ?", fr: "Il faut libérer la chambre à quelle heure ?", en: "When is check-out?", g: 1 },
      ],
      keys: [
        ["reservation", "une chambre", "nuits", "au nom"],
        ["petit dejeuner", "wifi", "liberer"],
      ],
    },
    telephone: {
      exprs: [
        { t: "Bonjour, je pourrais parler à… ?", fr: "Bonjour, je pourrais parler à… ?", en: "Hello, could I speak to…?", g: 0 },
        { t: "J'appelle au sujet de…", fr: "J'appelle au sujet de…", en: "I'm calling about…", g: 0 },
        { t: "Vous pouvez répéter, s'il vous plaît ?", fr: "Vous pouvez répéter, s'il vous plaît ?", en: "Could you repeat, please?", g: 0 },
        { t: "Je voudrais prendre rendez-vous.", fr: "Je voudrais prendre rendez-vous.", en: "I'd like to make an appointment.", g: 1 },
        { t: "Mardi, ça vous va ?", fr: "Mardi, ça vous va ?", en: "Does Tuesday suit you?", g: 1 },
        { t: "Parfait, à mardi.", fr: "Parfait, à mardi.", en: "Perfect, see you Tuesday.", g: 1 },
      ],
      keys: [
        ["parler a", "j appelle", "appelle", "repeter"],
        ["rendez vous", "mardi", "ca vous va"],
      ],
    },
  },
  zh: {
    restaurant: {
      exprs: [
        { t: "两位，谢谢。", r: "liǎng wèi, xièxie", fr: "Deux personnes, merci.", en: "Two people, thanks.", g: 0 },
        { t: "有什么推荐的？", r: "yǒu shénme tuījiàn de", fr: "Qu'est-ce que vous recommandez ?", en: "What do you recommend?", g: 0 },
        { t: "我要一碗牛肉面。", r: "wǒ yào yì wǎn niúròu miàn", fr: "Je voudrais un bol de nouilles au bœuf.", en: "I'd like a bowl of beef noodles.", g: 0 },
        { t: "服务员，买单！", r: "fúwùyuán, mǎidān", fr: "S'il vous plaît, l'addition !", en: "Waiter, the bill!", g: 1 },
        { t: "很好吃。", r: "hěn hǎochī", fr: "C'est très bon.", en: "It's delicious.", g: 1 },
        { t: "可以打包吗？", r: "kěyǐ dǎbāo ma", fr: "Je peux emporter les restes ?", en: "Can I take the rest away?", g: 1 },
      ],
      keys: [
        ["两位", "推荐", "我要", "点菜"],
        ["买单", "结账", "好吃", "打包"],
      ],
    },
    hotel: {
      exprs: [
        { t: "我预订了一个房间。", r: "wǒ yùdìng le yí ge fángjiān", fr: "J'ai réservé une chambre.", en: "I booked a room.", g: 0 },
        { t: "还有空房间吗？", r: "hái yǒu kòng fángjiān ma", fr: "Il reste des chambres libres ?", en: "Are there any rooms left?", g: 0 },
        { t: "住三个晚上。", r: "zhù sān ge wǎnshang", fr: "Pour trois nuits.", en: "For three nights.", g: 0 },
        { t: "早餐几点？", r: "zǎocān jǐ diǎn", fr: "Le petit-déjeuner est à quelle heure ?", en: "What time is breakfast?", g: 1 },
        { t: "无线网密码是多少？", r: "wúxiànwǎng mìmǎ shì duōshao", fr: "Quel est le mot de passe du wifi ?", en: "What's the wifi password?", g: 1 },
        { t: "几点退房？", r: "jǐ diǎn tuìfáng", fr: "À quelle heure faut-il libérer la chambre ?", en: "What time is check-out?", g: 1 },
      ],
      keys: [
        ["预订", "房间", "晚上"],
        ["早餐", "密码", "无线网", "退房"],
      ],
    },
    telephone: {
      exprs: [
        { t: "喂，请问王老师在吗？", r: "wéi, qǐngwèn Wáng lǎoshī zài ma", fr: "Allô, est-ce que M. Wang est là ?", en: "Hello, is Mr Wang there?", g: 0 },
        { t: "我是李明。", r: "wǒ shì Lǐ Míng", fr: "C'est Li Ming.", en: "This is Li Ming.", g: 0 },
        { t: "请再说一遍。", r: "qǐng zài shuō yí biàn", fr: "Vous pouvez répéter ?", en: "Please say it again.", g: 0 },
        { t: "我想预约。", r: "wǒ xiǎng yùyuē", fr: "Je voudrais prendre rendez-vous.", en: "I'd like to make an appointment.", g: 1 },
        { t: "星期二可以吗？", r: "xīngqī'èr kěyǐ ma", fr: "Mardi, ça va ?", en: "Is Tuesday OK?", g: 1 },
        { t: "好的，星期二见。", r: "hǎo de, xīngqī'èr jiàn", fr: "D'accord, à mardi.", en: "OK, see you Tuesday.", g: 1 },
      ],
      keys: [
        ["请问", "在吗", "我是", "再说"],
        ["预约", "星期二", "见"],
      ],
    },
  },
  ar: {
    restaurant: {
      exprs: [
        { t: "طاولة لشخصين، إذا بتريد.", r: "ṭāwle la-shakhṣēn, iza btrīd", fr: "Une table pour deux, s'il vous plaît.", en: "A table for two, please.", g: 0 },
        { t: "شو بتنصحني؟", r: "shu btinṣaḥni", fr: "Que me conseillez-vous ?", en: "What do you recommend?", g: 0 },
        { t: "بدّي شيش طاووق.", r: "baddi shīsh ṭāwūʾ", fr: "Je voudrais un shish taouk.", en: "I'd like the shish taouk.", g: 0 },
        { t: "الحساب، إذا بتريد.", r: "el-ḥsēb, iza btrīd", fr: "L'addition, s'il vous plaît.", en: "The bill, please.", g: 1 },
        { t: "الأكل كتير طيّب.", r: "el-akl ktīr ṭayyeb", fr: "La nourriture est délicieuse.", en: "The food is delicious.", g: 1 },
        { t: "الخدمة محسوبة؟", r: "el-khidme maḥsūbe", fr: "Le service est compris ?", en: "Is service included?", g: 1 },
      ],
      keys: [
        ["طاولة", "بتنصح", "بدي", "طاووق"],
        ["الحساب", "طيب", "الخدمة", "ادفع"],
      ],
    },
    hotel: {
      exprs: [
        { t: "عندي حجز بإسم…", r: "ʿandi ḥajz b-ism…", fr: "J'ai une réservation au nom de…", en: "I have a booking under the name…", g: 0 },
        { t: "في عندكن أوضة فاضية؟", r: "fī ʿandkon ūḍa fāḍye", fr: "Vous avez une chambre libre ?", en: "Do you have a free room?", g: 0 },
        { t: "لتلات ليالي.", r: "la-tlēt layēli", fr: "Pour trois nuits.", en: "For three nights.", g: 0 },
        { t: "إيمتى الترويقة؟", r: "aymta t-trwīʾa", fr: "Le petit-déjeuner est quand ?", en: "When is breakfast?", g: 1 },
        { t: "شو الباسوورد تبع الواي فاي؟", r: "shu l-password tabaʿ el-wifi", fr: "Quel est le mot de passe du wifi ?", en: "What's the wifi password?", g: 1 },
        { t: "إيمتى لازم فلّ من الأوضة؟", r: "aymta lēzem fill min el-ūḍa", fr: "Quand dois-je libérer la chambre ?", en: "When do I have to leave the room?", g: 1 },
      ],
      keys: [
        ["حجز", "اوضة", "غرفة", "ليالي", "باسم"],
        ["الترويقة", "الواي", "الباسوورد", "فل", "لازم"],
      ],
    },
    telephone: {
      exprs: [
        { t: "ألو، فيني إحكي مع…؟", r: "alo, fīni iḥki maʿ…", fr: "Allô, je peux parler à… ?", en: "Hello, may I speak to…?", g: 0 },
        { t: "عم بتّصل بخصوص…", r: "ʿam bittiṣil b-khṣūṣ…", fr: "J'appelle au sujet de…", en: "I'm calling about…", g: 0 },
        { t: "فيك تعيد، إذا بتريد؟", r: "fīk tʿīd, iza btrīd", fr: "Vous pouvez répéter, s'il vous plaît ?", en: "Could you repeat, please?", g: 0 },
        { t: "بدّي آخد موعد.", r: "baddi ēkhod mawʿad", fr: "Je voudrais prendre rendez-vous.", en: "I'd like to make an appointment.", g: 1 },
        { t: "بيناسبك نهار التلاتا؟", r: "bināsbak nhār et-tlēta", fr: "Mardi, ça vous va ?", en: "Does Tuesday suit you?", g: 1 },
        { t: "تمام، منشوفك التلاتا.", r: "tamēm, mnshūfak et-tlēta", fr: "Parfait, à mardi.", en: "Great, see you on Tuesday.", g: 1 },
      ],
      keys: [
        ["احكي", "بتصل", "تعيد"],
        ["موعد", "التلاتا", "بيناسب"],
      ],
    },
  },
  hi: {
    restaurant: {
      exprs: [
        { t: "दो लोगों के लिए टेबल चाहिए।", r: "do logoṁ ke lie ṭebal cāhie", fr: "Une table pour deux, s'il vous plaît.", en: "A table for two, please.", g: 0 },
        { t: "आप क्या सुझाव देंगे?", r: "āp kyā sujhāv deṁge", fr: "Que me conseillez-vous ?", en: "What would you suggest?", g: 0 },
        { t: "मुझे दाल मखनी चाहिए।", r: "mujhe dāl makhnī cāhie", fr: "Je voudrais un dal makhani.", en: "I'd like the dal makhani.", g: 0 },
        { t: "बिल ले आइए।", r: "bil le āie", fr: "Apportez l'addition.", en: "Please bring the bill.", g: 1 },
        { t: "खाना बहुत स्वादिष्ट था।", r: "khānā bahut svādiṣṭ thā", fr: "Le repas était délicieux.", en: "The food was delicious.", g: 1 },
        { t: "क्या मैं यूपीआई से पे कर सकता हूँ?", r: "kyā maiṁ yūpīāī se pe kar saktā hūṁ", fr: "Je peux payer par UPI ?", en: "Can I pay by UPI?", g: 1 },
      ],
      keys: [
        ["टेबल", "सुझाव", "चाहिए"],
        ["बिल", "स्वादिष्ट", "पे कर"],
      ],
    },
    hotel: {
      exprs: [
        { t: "मेरी बुकिंग … के नाम से है।", r: "merī buking … ke nām se hai", fr: "Ma réservation est au nom de…", en: "My booking is under the name…", g: 0 },
        { t: "क्या कोई कमरा खाली है?", r: "kyā koī kamrā khālī hai", fr: "Il y a une chambre libre ?", en: "Is there a free room?", g: 0 },
        { t: "तीन रातों के लिए।", r: "tīn rātoṁ ke lie", fr: "Pour trois nuits.", en: "For three nights.", g: 0 },
        { t: "नाश्ता कितने बजे है?", r: "nāśtā kitne baje hai", fr: "Le petit-déjeuner est à quelle heure ?", en: "What time is breakfast?", g: 1 },
        { t: "वाई-फ़ाई का पासवर्ड क्या है?", r: "vāī-fāī kā pāsvarḍ kyā hai", fr: "Quel est le mot de passe du wifi ?", en: "What's the wifi password?", g: 1 },
        { t: "चेकआउट कितने बजे है?", r: "cekāuṭ kitne baje hai", fr: "Le départ est à quelle heure ?", en: "What time is check-out?", g: 1 },
      ],
      keys: [
        ["बुकिंग", "कमरा", "रातों"],
        ["नाश्ता", "पासवर्ड", "चेकआउट"],
      ],
    },
    telephone: {
      exprs: [
        { t: "नमस्ते, क्या मैं … से बात कर सकता हूँ?", r: "namaste, kyā maiṁ … se bāt kar saktā hūṁ", fr: "Bonjour, je peux parler à… ?", en: "Hello, may I speak to…?", g: 0 },
        { t: "मैं … के बारे में फ़ोन कर रहा हूँ।", r: "maiṁ … ke bāre meṁ fon kar rahā hūṁ", fr: "J'appelle au sujet de…", en: "I'm calling about…", g: 0 },
        { t: "कृपया फिर से बोलिए।", r: "kṛpayā phir se bolie", fr: "Répétez, s'il vous plaît.", en: "Please say it again.", g: 0 },
        { t: "मुझे अपॉइंटमेंट लेना है।", r: "mujhe apŏiṁṭmeṁṭ lenā hai", fr: "Je voudrais prendre rendez-vous.", en: "I'd like to make an appointment.", g: 1 },
        { t: "क्या मंगलवार ठीक रहेगा?", r: "kyā maṁgalvār ṭhīk rahegā", fr: "Mardi, ça ira ?", en: "Will Tuesday be fine?", g: 1 },
        { t: "ठीक है, मंगलवार को मिलते हैं।", r: "ṭhīk hai, maṁgalvār ko milte haiṁ", fr: "D'accord, à mardi.", en: "OK, see you on Tuesday.", g: 1 },
      ],
      keys: [
        ["नमस्ते", "बात कर", "फ़ोन", "फोन", "फिर से"],
        ["अपॉइंटमेंट", "मंगलवार", "मिलते"],
      ],
    },
  },
  id: {
    restaurant: {
      exprs: [
        { t: "Meja untuk dua orang, ya.", fr: "Une table pour deux, s'il vous plaît.", en: "A table for two, please.", g: 0 },
        { t: "Apa yang enak di sini?", fr: "Qu'est-ce qui est bon ici ?", en: "What's good here?", g: 0 },
        { t: "Saya mau nasi goreng.", fr: "Je voudrais un riz frit.", en: "I'd like fried rice.", g: 0 },
        { t: "Minta bonnya, ya.", fr: "L'addition, s'il vous plaît.", en: "The bill, please.", g: 1 },
        { t: "Enak sekali.", fr: "C'est délicieux.", en: "It's delicious.", g: 1 },
        { t: "Bisa bayar pakai kartu?", fr: "Je peux payer par carte ?", en: "Can I pay by card?", g: 1 },
      ],
      keys: [
        ["meja", "yang enak", "saya mau", "pesan"],
        ["bonnya", "minta bon", "enak sekali", "bayar"],
      ],
    },
    hotel: {
      exprs: [
        { t: "Saya sudah pesan kamar atas nama…", fr: "J'ai réservé une chambre au nom de…", en: "I booked a room under the name…", g: 0 },
        { t: "Ada kamar kosong?", fr: "Il y a une chambre libre ?", en: "Is there a free room?", g: 0 },
        { t: "Untuk tiga malam.", fr: "Pour trois nuits.", en: "For three nights.", g: 0 },
        { t: "Sarapan jam berapa?", fr: "Le petit-déjeuner est à quelle heure ?", en: "What time is breakfast?", g: 1 },
        { t: "Kata sandi wifinya apa?", fr: "Quel est le mot de passe du wifi ?", en: "What's the wifi password?", g: 1 },
        { t: "Check-out jam berapa?", fr: "Le départ est à quelle heure ?", en: "What time is check-out?", g: 1 },
      ],
      keys: [
        ["pesan kamar", "kamar", "malam", "atas nama"],
        ["sarapan", "wifi", "kata sandi", "check out"],
      ],
    },
    telephone: {
      exprs: [
        { t: "Halo, bisa bicara dengan…?", fr: "Allô, je peux parler à… ?", en: "Hello, can I speak to…?", g: 0 },
        { t: "Saya menelepon soal…", fr: "J'appelle au sujet de…", en: "I'm calling about…", g: 0 },
        { t: "Bisa diulang?", fr: "Vous pouvez répéter ?", en: "Could you repeat?", g: 0 },
        { t: "Saya mau buat janji.", fr: "Je voudrais prendre rendez-vous.", en: "I'd like to make an appointment.", g: 1 },
        { t: "Hari Selasa bisa?", fr: "Mardi, c'est possible ?", en: "Is Tuesday OK?", g: 1 },
        { t: "Baik, sampai hari Selasa.", fr: "D'accord, à mardi.", en: "OK, see you Tuesday.", g: 1 },
      ],
      keys: [
        ["bicara", "menelepon", "diulang"],
        ["janji", "selasa", "sampai"],
      ],
    },
  },
  tr: {
    restaurant: {
      exprs: [
        { t: "İki kişilik bir masa, lütfen.", fr: "Une table pour deux, s'il vous plaît.", en: "A table for two, please.", g: 0 },
        { t: "Ne önerirsiniz?", fr: "Que me conseillez-vous ?", en: "What do you recommend?", g: 0 },
        { t: "Bir mercimek çorbası istiyorum.", fr: "Je voudrais une soupe de lentilles.", en: "I'd like a lentil soup.", g: 0 },
        { t: "Hesap, lütfen.", fr: "L'addition, s'il vous plaît.", en: "The bill, please.", g: 1 },
        { t: "Çok lezzetliydi.", fr: "C'était très bon.", en: "It was delicious.", g: 1 },
        { t: "Kartla ödeyebilir miyim?", fr: "Je peux payer par carte ?", en: "Can I pay by card?", g: 1 },
      ],
      keys: [
        ["masa", "onerir", "istiyorum"],
        ["hesap", "lezzetli", "odeye"],
      ],
    },
    hotel: {
      exprs: [
        { t: "… adına rezervasyonum var.", fr: "J'ai une réservation au nom de…", en: "I have a booking under the name…", g: 0 },
        { t: "Boş odanız var mı?", fr: "Vous avez une chambre libre ?", en: "Do you have a free room?", g: 0 },
        { t: "Üç gece için.", fr: "Pour trois nuits.", en: "For three nights.", g: 0 },
        { t: "Kahvaltı saat kaçta?", fr: "Le petit-déjeuner est à quelle heure ?", en: "What time is breakfast?", g: 1 },
        { t: "Wi-fi şifresi ne?", fr: "Quel est le mot de passe du wifi ?", en: "What's the wifi password?", g: 1 },
        { t: "Odayı saat kaçta boşaltmam gerekiyor?", fr: "À quelle heure dois-je libérer la chambre ?", en: "What time do I have to check out?", g: 1 },
      ],
      keys: [
        ["rezervasyon", "odanız", "oda", "gece"],
        ["kahvaltı", "sifre", "bosalt"],
      ],
    },
    telephone: {
      exprs: [
        { t: "Alo, … ile görüşebilir miyim?", fr: "Allô, je peux parler à… ?", en: "Hello, may I speak to…?", g: 0 },
        { t: "… için arıyorum.", fr: "J'appelle au sujet de…", en: "I'm calling about…", g: 0 },
        { t: "Tekrar eder misiniz?", fr: "Vous pouvez répéter ?", en: "Could you repeat?", g: 0 },
        { t: "Randevu almak istiyorum.", fr: "Je voudrais prendre rendez-vous.", en: "I'd like to make an appointment.", g: 1 },
        { t: "Salı uygun mu?", fr: "Mardi, ça vous va ?", en: "Is Tuesday OK?", g: 1 },
        { t: "Tamam, salı görüşürüz.", fr: "D'accord, à mardi.", en: "OK, see you Tuesday.", g: 1 },
      ],
      keys: [
        ["gorusebilir", "arıyorum", "tekrar"],
        ["randevu", "salı", "gorusuruz"],
      ],
    },
  },
};
