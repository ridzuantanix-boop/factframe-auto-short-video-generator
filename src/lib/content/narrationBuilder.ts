import type { EntityType, Fact } from "@/lib/types";

const openings: Record<EntityType, (name: string, description: string) => string[]> = {
  person: (name, description) => [
    `Di sebalik nama ${name}, tersimpan sebuah perjalanan hidup yang menarik untuk ditelusuri.`,
    `${name} dikenali sebagai ${description.replace(/\.$/, "")}.`,
  ],
  place: (name, description) => [
    `${name} bukan sekadar satu titik pada peta; tempat ini menyimpan kisahnya sendiri.`,
    `Menurut rekod awam, ${name} ialah ${description.replace(/\.$/, "")}.`,
  ],
  event: (name, description) => [
    `Untuk memahami ${name}, kita perlu menelusuri semula detik yang membentuk peristiwa ini.`,
    `Rekod awam menggambarkannya sebagai ${description.replace(/\.$/, "")}.`,
  ],
  object: (name, description) => [
    `Setiap objek bersejarah mempunyai cerita, dan kisah ${name} bermula daripada rekod yang masih kekal hingga hari ini.`,
    `${name} ialah ${description.replace(/\.$/, "")}.`,
  ],
  organisation: (name, description) => [
    `Di sebalik nama ${name}, terdapat perjalanan sebuah organisasi yang dibentuk oleh masa dan peristiwa.`,
    `${name} ialah ${description.replace(/\.$/, "")}.`,
  ],
  animal: (name, description) => [
    `Alam semula jadi menyimpan banyak kisah menakjubkan, dan ${name} mempunyai tempatnya yang tersendiri.`,
    `${name} ialah ${description.replace(/\.$/, "")}.`,
  ],
  space: (name, description) => [
    `Jauh di angkasa, ${name} menyimpan sebuah kisah yang dibina daripada pemerhatian dan penemuan manusia.`,
    `${name} ialah ${description.replace(/\.$/, "")}.`,
  ],
  general: (name, description) => [
    `Di sebalik nama ${name}, ada sebuah kisah yang wajar ditelusuri melalui fakta yang direkodkan.`,
    `${name} ialah ${description.replace(/\.$/, "")}.`,
  ],
};

const endings: Record<EntityType, (name: string) => string> = {
  person: (name) => `Daripada permulaan hidup hingga sumbangannya, perjalanan ${name} terus menjadi sebahagian daripada catatan sejarah.`,
  place: (name) => `Fakta-fakta inilah yang membentuk identiti ${name} dan kisahnya yang terus dikenang hingga kini.`,
  event: (name) => `Setiap fakta ini membantu kita melihat bagaimana ${name} mendapat tempat dalam catatan sejarah.`,
  object: (name) => `Daripada asal-usulnya hingga kesannya, itulah perjalanan yang membentuk kisah ${name}.`,
  organisation: (name) => `Semua detik ini membentuk perjalanan ${name} seperti yang direkodkan pada hari ini.`,
  animal: (name) => `Fakta-fakta ini memperlihatkan keunikan ${name} dalam dunia semula jadi yang luas.`,
  space: (name) => `Setiap penemuan menambah satu lagi halaman pada kisah ${name} di angkasa.`,
  general: (name) => `Apabila fakta ini disusun bersama, kisah ${name} menjadi lebih jelas dan bermakna.`,
};

export function buildNarration(name: string, description: string, type: EntityType, facts: Fact[], context?: string) {
  const usefulFacts = facts.filter((fact) => fact.label !== "Gambaran ringkas");
  const sentences = [...openings[type](name, description), ...usefulFacts.map((fact) => fact.sentence)];
  if (context) {
    const extras = context.split(/(?<=[.!?])\s+/).filter((sentence) => {
      const words = sentence.split(/\s+/).length;
      return words >= 8 && words <= 38 && !sentences.some((item) => item.toLowerCase().includes(sentence.slice(0, 20).toLowerCase()));
    });
    while (sentences.join(" ").split(/\s+/).length < 62 && extras.length) {
      const extra = extras.shift()!;
      const projected = `${sentences.join(" ")} ${extra} ${endings[type](name)}`.split(/\s+/).length;
      if (projected <= 88) sentences.splice(Math.max(2, sentences.length - 1), 0, extra);
    }
  }
  sentences.push(endings[type](name));
  return sentences.join(" ").replace(/&#x20;|&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
}
