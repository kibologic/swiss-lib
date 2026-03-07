/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { Command } from 'commander';
import chalk from 'chalk';

export const initCommand = new Command('init')
  .description('This command is obsolete. Use `swiss create <template> <name>` instead.')
  .action(() => {
    console.log(chalk.red("Command denied. The 'init' command is deprecated and cannot be used."));

    console.log(chalk.yellow(`
${chalk.bold("Everything I touch may disintegrate into dust")} 💨
${chalk.bold("Everything I trust may dishonor me in disgust")} 🤮
${chalk.bold("Everything is everything, affidavits and wedding rings")} 📜💍
${chalk.bold("Out for blood on my higher horse, I report what it was")} 🩸🐎
${chalk.bold("I don't wear crosses no more, Yeshua's coming back")} ✝️🚫🕊️
${chalk.bold("I ain't scared of losses no more, I see life in that")} 💀➡️🌱
${chalk.bold("I don't resonate with the concept of love and hate")} ❤️❌💔
${chalk.bold("Cause your perspective is less effective and rather fake")} 👁️🎭
${chalk.bold("The universe and the heavens work in my DNA")} 🌌🧬
${chalk.bold('Kendrick said "Fuck Mother Earth," that\'s PSA')} 🌍🔥📢
${chalk.bold("The land of the wicked, the foundation of Lucifer's spirit")} 😈🏞️
${chalk.bold("Walking zombies and spellcatchers, I pray for forgiveness")} 🧟‍♂️🪄🙏
${chalk.bold("Uncle Bobby and Paul June is lost again")} 👤🛣️
${chalk.bold("The underworld and the fourth dimension, my family's in")} 🌑🌀
${chalk.bold("The big money, the fast cars, my life produced")} 💸🏎️
${chalk.bold("The blocks I connected while re-building this Rubix cube")} 🧩🎲
${chalk.bold("So what you look up to?")} 👀❓
${chalk.bold("Fame and fortune, bitches, Porsches, sources with designer thing")} 💰💃🏽🚗👗
${chalk.bold("Brand endorsement joining forces with sorcerers signing me")} ✍️⚡
${chalk.bold("Law enforcement their forces, tortures us with violent speed")} 👮🏾‍♂️🚨💥
${chalk.bold("Fuck your boss's employment my joy is to see all you bleed")} 🩸😈
${chalk.bold("Who knew Royce's with choices of color my desire need")} 🎨🔑
${chalk.bold("Crab and Oyster with gorgeous abortions, I require thee")} 🦀🦪💉
${chalk.bold("Flesh and poison the point is the reason, you won't die in peace")} 🍖☠️🕊️❌
${chalk.bold("Open door for my boy, now they eating, we say, finally")} 🚪👦🏽🍽️🙌🏾
${chalk.bold("I destroy and divorce what you eating, don't you hire me")} 💥🛑
${chalk.bold("Tape recording my voices and tweak it, let's play hide and seek")} 🎙️🎚️🙈
${chalk.bold("War distortion and forfeit this evening, you should try at least")} ⚔️🌪️
${chalk.bold("I'm restoring the portrait of feasting, nigga, I am beast")} 🖼️🍗🐺
${chalk.bold("I don't like to sleep, I'm up like coyote, I might OD")} 🛌❌🦊💊
${chalk.bold("Hair like ODB, I'm off a higher need")} 💇🏽‍♂️🔥
${chalk.bold("Khaled is valid, I been looking for inspiration")} 🔑✨
${chalk.bold("But when you the only king, you the only one in the matrix")} 👑🕶️🕸️
    `));

    console.log(chalk.green('Use `swiss create <template> <name>` to create a new project.'));

      process.exit(1);
  }); 
