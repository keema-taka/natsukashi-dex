// prisma/seed.cjs
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const samples = [
    {
      id: "1",
      title: "駅前のゲームセンター『ロケット』",
      episode: "放課後みんなでメダルゲーム。店員さんのBGMセンスが神。",
      yearFrom: 2003,
      yearTo: 2010,
      city: "〇〇市",
      tags: ["お店", "遊び"],
      imageUrl:
        "https://images.unsplash.com/photo-1536072810076-7c846df42a3f?q=80&w=1200&auto=format&fit=crop",
      contributor: { id: "u1", name: "taka", avatarUrl: "https://i.pravatar.cc/100?img=12" },
      likes: 12,
    },
    {
      id: "2",
      title: "夏祭りの屋台『鈴木商店』のりんご飴",
      episode: "初めて好きな人と並んで食べた味。毎年の夏の匂い。",
      yearFrom: 1998,
      yearTo: 2015,
      city: "〇〇町",
      tags: ["お祭り", "食べ物"],
      imageUrl:
        "https://images.unsplash.com/photo-1596733430284-5e41b4c10601?q=80&w=1200&auto=format&fit=crop",
      contributor: { id: "u2", name: "yuri", avatarUrl: "https://i.pravatar.cc/100?img=47" },
      likes: 34,
    },
    {
      id: "3",
      title: "商店街の掲示板『みんなの伝言板』",
      episode: "バンドメンバー募集やフリマの告知でいっぱい。紙のにおいと画鋲の跡。",
      yearFrom: 1995,
      yearTo: 2012,
      city: "△△市",
      tags: ["商店街", "文化"],
      imageUrl:
        "https://images.unsplash.com/photo-1510936111840-65e151ad71bb?q=80&w=1200&auto=format&fit=crop",
      contributor: { id: "u3", name: "ken", avatarUrl: "https://i.pravatar.cc/100?img=5" },
      likes: 18,
    },
  ];

  for (const s of samples) {
    await prisma.entry.upsert({
      where: { id: s.id },
      update: {},
      create: s,
    });
  }
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
