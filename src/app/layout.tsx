import "./globals.css";
import { GeistSans } from "geist/font/sans";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={GeistSans.className}>
      <head>
        <title>Pensine - Garden of Knowledge</title>
        <meta
          name="description"
          content="Here you will find my garden of knowledge, a place where I share all the subjects I have mastered or am in the process of learning."
        />
        <meta name="generator" content="Next.js" />
        <meta name="application-name" content="Pensine" />
        <meta name="referrer" content="origin-when-cross-origin" />
        <meta name="rating" content="general" />
        <meta
          name="keywords"
          content="pensine, garden of knowledge, knowledge, learning, social, science, applied science, mathematics, physics, chemistry, biology, computer science, programming, software development, web development, web design, design, art, music, literature, philosophy, psychology, sociology, history, geography, economics, politics, law, education, health, medicine, engineering, technology, environment, ecology, agriculture, food, nutrition, sports, games, entertainment, leisure, travel, tourism, languages, culture, religion, spirituality, personal development, self-improvement, relationships, communication, work, business, management, marketing, finance, accounting, human resources, entrepreneurship, innovation, creativity, leadership, strategy, organization, quality, project management, information systems, cybersecurity, data science, artificial intelligence, machine learning, internet of things, blockchain, cloud computing, quantum computing, augmented reality, virtual reality, automation, robotics, nanotechnology, biotechnology, bioinformatics, geology, astronomy, cosmology, meteorology, oceanography, cartography, geodesy, physics of the Earth, chemistry of the Earth, biology of the Earth, environmental science, environmental engineering, environmental management, environmental policy, environmental law, environmental ethics, environmental economics, environmental sociology, environmental psychology, environmental education, environmental health, environmental technology, environmental design, environmental art, environmental music, environmental literature, environmental philosophy, environmental religion, environmental spirituality, environmental personal development, environmental self-improvement, environmental relationships, environmental communication, environmental work, environmental business, environmental management, environmental marketing, environmental finance, environmental accounting, environmental human resources, environmental entrepreneurship, environmental innovation, environmental creativity, environmental leadership, environmental strategy, environmental organization, environmental quality, environmental project management, environmental information systems, environmental cybersecurity, environmental data science, environmental artificial intelligence, environmental machine learning, environmental internet of things, environmental blockchain, environmental cloud computing, environmental quantum computing, environmental augmented reality, environmental virtual reality, environmental automation, environmental robotics, environmental nanotechnology, environmental biotechnology, environmental bioinformatics, environmental geology, environmental astronomy, environmental cosmology, environmental meteorology, environmental oceanography, environmental cartography, environmental geodesy, environmental physics of the Earth, environmental chemistry of the Earth, environmental biology of the Earth, social science, applied social science, sociology, psychology, anthropology, archaeology, history, geography, economics, politics, law, education, health, medicine, engineering, technology, environment, ecology, agriculture, food, nutrition, sports, games, entertainment, leisure, travel, tourism, languages,"
        />
        <meta name="author" content="Martin" />
        <meta name="creator" content="Martin" />
        <meta name="publisher" content="Nebula" />
        <meta
          name="format-detection"
          content="email=no, address=no, telephone=no"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="robots" content="all" />
        <link rel="canonical" href="https://pensine.nebula.li" />
        <meta property="og:title" content="Pensine - Garden of Knowledge" />
        <meta
          property="og:description"
          content="Here you will find my garden of knowledge, a place where I share all the subjects I have mastered or am in the process of learning."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://pensine.nebula.li" />
        <meta
          property="og:image"
          content="https://pensine.nebula.li/assets/img/pensine.png"
        />
        <meta property="og:site_name" content="Pensine - Garden of Knowledge" />
        <meta property="og:locale" content="en_US" />
      </head>
      <body>{children}</body>
    </html>
  );
}
