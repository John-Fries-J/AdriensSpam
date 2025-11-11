const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const userMessages = new Map();

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        if (message.author.bot || !message.guild || !message.content) return;

        const config = require('../config.json');

        const userId = message.author.id;
        const content = message.content;
        const channelId = message.channel.id;
        const messageId = message.id;
        const now = Date.now();

        if (!userMessages.has(userId)) {
            userMessages.set(userId, new Map());
        }

        const userData = userMessages.get(userId);
        let sends = userData.get(content) || [];
        sends = sends.filter(s => now - s.timestamp < 300000);

        sends.push({ channelId, timestamp: now, messageId });

        userData.set(content, sends);

        const uniqueChannels = new Set(sends.map(s => s.channelId));

        if (uniqueChannels.size >= 3) { 
            try {
                const member = await message.guild.members.fetch(userId);
                if (member) {
                    try{
                        await member.timeout(25200000, 'suspected spam');
                    } catch (error) {
                        await member.timeout(3600000, 'suspected spam');
                    }
                }
            } catch (error) {
                console.error(`Failed to timeout user ${userId}:`, error);
            }

            const channelMessagesToDelete = new Map();
            for (const send of sends) {
                if (!channelMessagesToDelete.has(send.channelId)) {
                    channelMessagesToDelete.set(send.channelId, []);
                }
                channelMessagesToDelete.get(send.channelId).push(send.messageId);
            }

            for (const [chId, msgIds] of channelMessagesToDelete) {
                try {
                    const channel = await message.client.channels.fetch(chId);
                    if (channel && channel.isTextBased()) {
                        await channel.bulkDelete(msgIds);
                    }
                } catch (error) {
                    console.error(`Failed to delete messages in channel ${chId}:`, error);
                }
            }

            try {
                await message.author.send(`You have been timed out for 1 hour as you have spammed the same message in multiple channels. If this is incorrect create a ticket in the discord!`);
            } catch (error) {
                console.log("Unable to dm user.")
            }

            const reportChannel = await message.client.channels.fetch(config.SpamReportID);
            if (!reportChannel) return;
            const embed = new EmbedBuilder()
                .setColor('Red')
                .setTitle('Spam Detected')
                .setDescription(`User ${message.author.tag} sent the same message in ${uniqueChannels.size} channels. User has been timed out for 1 hour and messages deleted.`)
                .addFields(
                    { name: 'Message Content', value: content || '[No text]', inline: false },
                    { name: 'Log of Sends', value: sends.map(s => `<#${s.channelId}> at ${new Date(s.timestamp).toLocaleString()}`).join('\n'), inline: false }
                )
                .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: `User ID: ${userId}` })
                .setTimestamp();
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`copy_id_${userId}`)
                        .setLabel('Click to copy user ID')
                        .setStyle(ButtonStyle.Primary)
                );
            let files = [];
            if (message.attachments.size > 0) {
                files = message.attachments.map(att => ({ attachment: att.url, name: att.name }));
            }
            await reportChannel.send({ content:'<@630070645874622494> <@282288494641020928>', embeds: [embed], components: [row], files });
            userData.delete(content);
        }
    },
};