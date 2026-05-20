import type { ChapterBook } from '../types/planning'

export const SEED_CHAPTER_BOOKS: ChapterBook[] = [
  {
    id: 'lion-witch-wardrobe',
    title: 'The Lion, the Witch and the Wardrobe',
    author: 'C.S. Lewis',
    totalChapters: 17,
    ageRange: '6-12',
    createdAt: new Date().toISOString(),
    chapters: [
      { number: 1, title: 'Lucy Looks into a Wardrobe', summary: 'Lucy discovers a magical wardrobe that leads to the snowy world of Narnia, where she meets Mr. Tumnus the faun.' },
      { number: 2, title: 'What Lucy Found There', summary: 'Mr. Tumnus gives Lucy tea and confesses he was supposed to hand her over to the White Witch, but changes his mind and helps her return home.' },
      { number: 3, title: 'Edmund and the Wardrobe', summary: 'Edmund follows Lucy into the wardrobe and meets the White Witch, who tempts him with Turkish Delight and promises to make him a prince.' },
      { number: 4, title: 'Turkish Delight', summary: 'The Witch enchants Edmund with Turkish Delight and learns about his siblings, planning to use him to capture all four children.' },
      { number: 5, title: 'Back on This Side of the Door', summary: 'Edmund lies about Narnia, denying Lucy\'s story and making her feel alone and disbelieved.' },
      { number: 6, title: 'Into the Forest', summary: 'All four children enter Narnia together and discover Mr. Tumnus has been arrested by the Witch\'s secret police.' },
      { number: 7, title: 'A Day with the Beavers', summary: 'The children meet Mr. and Mrs. Beaver, who tell them about Aslan and the prophecy that four humans will end the Witch\'s reign.' },
      { number: 8, title: 'What Happened After Dinner', summary: 'The Beavers explain Aslan\'s return and the prophecy. The children realize Edmund has slipped away to betray them to the Witch.' },
      { number: 9, title: 'In the Witch\'s House', summary: 'Edmund arrives at the Witch\'s castle expecting rewards, but finds it cold and full of stone statues of her enemies.' },
      { number: 10, title: 'The Spell Begins to Break', summary: 'The children and Beavers flee toward Aslan. Father Christmas appears, a sign the Witch\'s winter is ending, and gives the children gifts.' },
      { number: 11, title: 'Aslan Is Nearer', summary: 'Edmund suffers with the Witch as her sled gets stuck in the melting snow, and he begins to see her true cruelty.' },
      { number: 12, title: 'Peter\'s First Battle', summary: 'The children meet Aslan at the Stone Table. Peter fights and kills a wolf, earning his knighthood.' },
      { number: 13, title: 'Deep Magic from the Dawn of Time', summary: 'The Witch demands Edmund\'s life under the ancient law that all traitors belong to her. Aslan secretly offers himself in Edmund\'s place.' },
      { number: 14, title: 'The Triumph of the Witch', summary: 'Aslan is bound, mocked, shaved, and killed on the Stone Table while Lucy and Susan watch in grief.' },
      { number: 15, title: 'Deeper Magic from Before the Dawn of Time', summary: 'Aslan rises from the dead, explaining the deeper magic: when an innocent willingly dies in a traitor\'s place, death itself works backward.' },
      { number: 16, title: 'What Happened About the Statues', summary: 'Aslan breathes life into the Witch\'s stone statues, freeing her prisoners and building an army.' },
      { number: 17, title: 'The Hunting of the White Stag', summary: 'The children defeat the Witch, are crowned kings and queens of Narnia, reign for years, and eventually return home through the wardrobe as children again.' },
    ],
  },
]
