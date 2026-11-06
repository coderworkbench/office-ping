// Emoji for chat: the quick reactions and the picker's built-in set.
// The device's own emoji font draws them; no images are downloaded.

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export type EmojiGroup = { id: string; label: string; icon: string; emojis: string[] };

const set = (s: string) => s.split(' ');

export const EMOJI_GROUPS: EmojiGroup[] = [
  { id: 'smileys', label: 'Smileys', icon: '😀', emojis: set(
    '😀 😃 😄 😁 😆 😅 😂 🤣 😊 🙂 🙃 😉 😍 🥰 😘 😋 😎 🤩 🥳 😏 🤔 🤨 😐 😑 😶 🙄 😬 😌 😴 🤒 😷 🤧 😮 😯 😲 😳 🥺 😢 😭 😤 😡 🤯 😱 🤗 🤭') },
  { id: 'gestures', label: 'Gestures', icon: '👍', emojis: set(
    '👍 👎 👌 ✌️ 🤞 🤝 🙏 👏 🙌 👋 🤙 💪 👉 👈 👆 👇 ✋ 🖐️ ✊ 👊 ✍️ 🙋 🙆 🙅 🤷 🤦') },
  { id: 'hearts', label: 'Hearts and symbols', icon: '❤️', emojis: set(
    '❤️ 🧡 💛 💚 💙 💜 🤎 🖤 🤍 💔 💕 💖 💯 ✨ ⭐ 🌟 🔥 ⚡ ✅ ❌ ❗ ❓') },
  { id: 'work', label: 'Work', icon: '💼', emojis: set(
    '📅 📆 ⏰ ⏳ 📌 📎 📝 📄 📊 📈 📉 💼 📁 📋 🖨️ 💻 🖥️ 📱 ☎️ 📞 📧 ✉️ 🔒 🔑 💡 🔧 🚗 🏢 ☕ 🍵 🍽️') },
  { id: 'celebrate', label: 'Celebrate', icon: '🎉', emojis: set(
    '🎉 🎊 🎂 🍰 🎁 🎈 🏆 🥇 🎯 🚀 🌸 🌺 🌞 🌈 🍕 🍔 🍩 🍫 🍿 🥤 🎶 🎵') },
];
