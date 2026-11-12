const DBHandler = require('./db_handler');
const mongoose = require('mongoose');
const Game = require('../models/GameModel.js');
const Player = require('../models/PlayerModel.js');
const { createGuestUser, createBotUser } = require('../controllers/AuthController.js');
const { createVsBotsGame, runBotsForGame } = require('../controllers/BotController.js');
const { performActions } = require('../config/game_runner.js');

DBHandler.setup();

describe('Bots mode', () => {
    it('creates bot users marked as bots', async () => {
        const bot = await createBotUser();
        expect(bot.bot).toBe(true);
        expect(!!bot.admin).toBe(false);
        expect(String(bot.username)).toMatch(/^bot_/);
    });

    it('starts a vs-bots match with human + bot players on the board', async () => {
        const human = await createGuestUser();
        const game = await createVsBotsGame(human, { botCount: 2, size: 8 });

        expect(game.vsBots).toBe(true);
        expect(game.hasStarted).toBe(true);
        expect(game.turnTime).toBe(1);

        const players = await Player.find({ game_id: game._id });
        expect(players).toHaveLength(3);
        expect(players.filter(p => p.isBot)).toHaveLength(2);
        expect(players.every(p => p.position && p.position.x != null)).toBe(true);
    });

    it('bots spend AP through real action controllers', async () => {
        const human = await createGuestUser();
        const game = await createVsBotsGame(human, { botCount: 1, size: 6 });
        const players = await Player.find({ game_id: game._id });
        const bot = players.find(p => p.isBot);
        const person = players.find(p => !p.isBot);
        expect(bot).toBeTruthy();
        expect(person).toBeTruthy();

        // Place bot orthogonally adjacent and grant AP so a move/attack is possible
        bot.position = { x: person.position.x, y: person.position.y + 1 };
        if (bot.position.y >= game.size.height) {
            bot.position.y = person.position.y - 1;
        }
        bot.actions = 2;
        await bot.save();

        const beforeActions = bot.actions;
        const beforeX = bot.position.x;
        const beforeY = bot.position.y;
        await runBotsForGame(game._id);
        const after = await Player.findById(bot._id);

        const moved = after.position.x !== beforeX || after.position.y !== beforeY;
        const spent = after.actions < beforeActions;
        const damagedHuman = (await Player.findById(person._id)).health < person.health;
        expect(moved || spent || damagedHuman).toBe(true);
    });

    it('game_runner bot hook does not throw for vsBots games', async () => {
        const human = await createGuestUser();
        const game = await createVsBotsGame(human, { botCount: 1, size: 6 });
        game.turnTimePassed = game.turnTime;
        await game.save();
        await expect(performActions(game)).resolves.not.toThrow();
    });
});
