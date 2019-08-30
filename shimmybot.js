"use strict";

// TODO User agent header
// TODO Don't write to file when unnecessary
// TODO Custom array join function
// TODO SQL for storage
// TODO Report network errors
// TODO Cache rule
// TODO stringify ints as strings?
// TODO isRole, getRole and mentionRole etc
// TODO Use promises instead of callbacks
// TODO version and update notes
// TODO settings categories
// TODO Nulls for empty command maps and alias arrays?
// TODO Extra messages on commands without args
// TODO Helpers for id to channel, role, etc
// TODO Organize helpers and methods
// TODO Stats command
// TODO Delay snapshot too
// TODO Use cached users, roles, channels etc
// TODO Fetch instead of cached for formatMessage?

// Deps
const Discord = require("discord.js");
const snekfetch = require("snekfetch");
const bzip2 = require("./bzip2");
const fs = require("fs");
const PNG = require("pngjs").PNG;
const Readable = require("stream").Readable;
const auth = require("./data/auth.json");
const config = require("./data/config.json");
const spawn = require("child_process").spawn;

// Another place
let loadedPixels;
let lastID = 0;
let size = 0;
let reading = false;
let lastRead = 0;

/*
* !!!IMPORTANT!!! for linux slice (0, -1) and call python3 instead
*/

// GPT2
const gpt2 = spawn("python", ["./jsintegration.py", "--model_name", config.gpt2.model], { cwd: "./gpt-2/src" });
gpt2.stdout.on("data", function(data)
{
  let text = data.toString().slice(0, -2); // Remove newline
  if(text === "ready") console.log("Loaded GPT-2 Model " + config.gpt2.model);
  else
  {
    let args = text.split(";");
    let user = args[0].split("=")[1];
    let channel = args[1].split("=")[1];
    channel = client.channels.get(channel);
    channel.stopTyping();
    channel.send("<@" + user + "> " + args.slice(2).join(";"));
  }
});

// Discord
const client = new Discord.Client();

let savedData = {};

// TODO Add set method?
class CommandMap extends Map
{
  constructor(commands)
  {
    super();
    this.aliasMap = new Map();
    if(commands) for(let a = 0, b = commands.length; a < b; ++a)
    {
      let command = commands[a];
      super.set(command.name, command);
      for(let c = 0, d = command.aliases.length; c < d; ++c) this.aliasMap.set(command.aliases[c], command.name);
    }
  }

  has(name)
  {
    return super.has(name) || this.aliasMap.has(name);
  }

  get(name)
  {
    return super.has(name) ? super.get(name) : super.get(this.aliasMap.get(name));
  }

  generateTree()
  {
    let text = "";
    this.forEach(command => text += command.generateTree());
    return text;
  }
}

class Command
{
  constructor(name, aliases, condition, action, usage, description, guildless, subCommandMap)
  {
    this.name = name;
    this.aliases = aliases;
    this.canRun = condition;
    this.run = action;
    this.usage = usage;
    this.description = description;
    this.guildless = guildless;
    this.subCommandMap = subCommandMap;
  }

/*
  generateTree()
  {
    let generateCommandTree = function(command, text, indent)
    {
      text += command.name + " " + command.usage + "\n";
      let index = 0;
      command.subCommandMap.forEach(function(subCommand)
      {
        text += indent;
        let subIndent = indent;
        if(++index === command.subCommandMap.size)
        {
          text += " └─";
          subIndent += "   ";
        }
        else
        {
          text += " ├─";
          subIndent += " │ ";
        }
        text = generateCommandTree(subCommand, text, subIndent);
      });
      return text;
    };
    return generateCommandTree(this, "", "");
  }
  */
  generateTree()
  {
    let generateCommandTree = function(command, indent, text, isLast)
    {
      text += indent;
      if(isLast)
      {
        text += " └─";
        indent += "   ";
      }
      else
      {
        text += " ├─";
        indent += " │ ";
      }
      text += command.name + " " + command.usage + "\n";
      let index = 0;
      command.subCommandMap.forEach(subCommand => text = generateCommandTree(subCommand, indent, text, ++index === command.subCommandMap.size));
      return text;
    }
    return generateCommandTree(this, "", "", true);
  }
}

const commandsByName = new CommandMap([
new Command("help", [], message => true, function(message, args)
{
  if(args.length === 0)
  {
    delayReply(message, "Here's a neat little tree I drew of everything I've learned so far!* Requests that I've marked with <> are optional. But I'm *totally* up for chatting if you're bored~" + getEmojiOrDefault("", "positive"), new Discord.RichEmbed()
    .setAuthor("Commands")
    .setColor(0xE39F10)
    .setDescription("```css\n" + commandsByName.generateTree() + "```")
    .setFooter("By " + config.author + ", v" + config.version));
  }
  else
  {
    let commandPair = findCommand(commandsByName, message, args[0], args.slice(1));
    if(commandPair) delayReply(message, getRandomElement([ "Oh it's pretty simple actually~, ", "", "So in short, " ]) + commandPair[0].description);
    else delayReply(message, "I think you might have mistaken " + args.join(" ") + " for something else. I can't do that!*");
  }
}, "[<command>]", "You're already doing it correctly, don't worry *giggles*", true, new CommandMap()),
new Command("about", [ "a" ], message => true, function(message, args)
{
  delayReply(message, (args.length > 0 ? "How interesting! I never knew that " + args.join(" ") + "!" : "") + " You *really* want to know more about ***me***? How flattering~! ~~Call me sometime~~" + getEmojiOrDefault("", "delight") + "\n" + getAboutMessage());
}, "", "I tell you a little about myself, you can do the same if you want and we get to know each other better. Isn't that just *wonderful*?!*~", true, new CommandMap()),
new Command("canvas", [ "c", "ap", "skelluxtm" ], message => true, function(message, args)
{
  message.reply(args.length > 0 ? "Here's yo-- wait.. " + args.join(" ") + "? **What**-? *I-I'll* just leave this here.." : "*Snap*", new Discord.Attachment(composePNG(loadedPixels).pack()));
  //delayReply(message, args.length > 0 ? "Here's yo-- wait.. " + args.join(" ") + "? **What**-? *I-I'll* just leave this here.." : "*Snap*", { files: [ att ] });
}, "[<command>]", "Everything related to the canvas at http://skelux.net/place.php. Important business! I can also take a *quick little* snap of the canvas for you and send it over the equestrian mail, just in case you can't make it there yourself*", true, new CommandMap([
  new Command("add", [ "a" ], message => hasPermission(message), function(message, args)
  {
    if(args.length < 4) delayReply(message, "Why did you just stop mid-sentence? Keep going, I want to know more!~ This is exciting!^^ " + getEmojiOrDefault("", "curious"));
    else
    {
      let reply = args.length > 4 ? args.slice(4).join(" ") + "-? *I-I-I'm* just gonna pretend I didn't see that-.. " : "";
      let guildData = getOrDefaultGuildData(getOrDefaultData().guildData, message.guild.id);
      if(args[0] in guildData.regions) delayReply(message, reply + "Come on now, you *know* two pieces of art can't have the same name^^~");
      else if(!isURL(args[1])) delayReply(message, reply + "I know enough about the internet to see that " + args[1] + " isn't a url or link of any kind^^..");
      else if(isNaN(args[2])) delayReply(message, reply + "Haha, " + args[2] + " isn't a number, silly! " + getEmojiOrDefault("", "funny"));
      else if(isNaN(args[3])) delayReply(message, reply + "Haha, " + args[3] + " isn't a number, silly! " + getEmojiOrDefault("", "funny"));
      else loadPNG(args[1], function(pixels, error)
      {
        if(error) delayReply(message, reply + "So I tried looking over that image and, well, *uuh*, I think there's something wrong with it. *Whispering* I think it may not *even* ***be*** a png image at all! " + getEmojiOrDefault("", "thonk"));
        else
        {
          let intersecting = Object.entries(guildData.regions).filter(entry => intersects(args[2], args[3], pixels.length, pixels[0].length, entry[1].x, entry[1].y, entry[1].pixels.length, entry[1].pixels[0].length)).map(entry => entry[0]);
          delayReply(message, reply + "*Gasp* Wow, that's.. that's my new favorite pixel fanart! I'm adding it to my collection as we speak!*" + (intersecting.length > 0 ? " *Bu-u-u-ut-* I noticed that it covers up a little bit of " + intersecting.join(", ") + " and we don't really want any art being *obscured*, right*? " + getEmojiOrDefault("worried") : ""));
          guildData.regions[args[0]] =
          {
            image: args[1],
            x: args[2],
            y: args[3],
            pixels: pixels
          }
          writeData();
        }
      });
    }
  }, "[name] [url] [x] [y]", "Just tell me all the details and I'll do my *best* watching over the art!^^ I must know what image I should be looking after, its name *of course* and the coordinates of its top left corner on the canvas", false, new CommandMap()),
  new Command("remove", [ "r", "trashit" ], message => hasPermission(message), function(message, args)
  {
    if(args.length === 0) delayReply(message, "I think you forgot to mention what you'd like removed^^ " + getEmojiOrDefault("", "funny"));
    else
    {
      let guildData = getOrDefaultGuildData(getOrDefaultData().guildData, message.guild.id);
      let accepted = [];
      let rejected = [];
      for(let a = 0, b = args.length; a < b; ++a)
      {
        if(args[a] in guildData.regions)
        {
          delete guildData.regions[args[a]];
          accepted.push(args[a]);
        }
        else rejected.push(args[a]);
      }
      delayReply(message, (accepted.length > 0 ? "I'll miss watching over " + accepted.join(", ") + ", " + (accepted.length === 1 ? "it really wasn't" : "they really weren't") + " *so* bad.. " + getEmojiOrDefault("", "happysad") : "") + (rejected.length > 0 ? " I don't remember anypony asking me to look after " + rejected.join(", ") + (accepted.length > 0 ? " though" : "") + getEmojiOrDefault("", "thonk") : ""));
      if(accepted.length > 0) writeData();
    }
  }, "[names]", "I can stop watching an image too. Make sure to ask me this only if ***absolutely*** necessary, like if it was misplaced, ok~?", false, new CommandMap()),
  new Command("clear", [ "c" ], message => hasPermission(message), function(message, args)
  {
    let guildData = getOrDefaultGuildData(getOrDefaultData().guildData, message.guild.id);
    let names = Object.keys(guildData.regions);
    delayReply(message, (args.length > 0 ? '"' + args.join(" ") + '" -- ' + message.author.username + " -- " + getDate() + ". Haha just kidding~^^ " + getEmojiOrDefault("", "funny") : "") + (names.length > 0 ? " W-wait, a-all of them-? But some of them were my favorites like " + getRandomElement(names) + " for example.. " + getEmojiOrDefault("", "worried") : "There're none ***to*** remove. We need more art on the canvas, I'm telling you! " + getEmojiOrDefault("", "irritated")));
    guildData.regions = {};
    writeData();
  }, "", "--I'll have *leave* ***everything*** without supervision. Why would *anyone* want ***this***-?", false, new CommandMap()),
  new Command("list", [ "l", "ciarecords" ], message => true, function(message, args)
  {
    let reply = args.length > 0 ? args.join(" ") + " what now-? I'm guessing you wanna see the art list. " + getEmojiOrDefault("", "confused") + " " : "";
    let names = Object.keys(getOrDefaultGuildData(getOrDefaultData().guildData, message.guild.id).regions);
    if(names.length === 0) delayReply(message, reply + "No art to watch just yet.. We *really* need to add some right now! Trust me, it'll be fun!^^ " + getEmojiOrDefault("", "curious"));
    else
    {
      delayReply(message, reply + "Yeah, these gorgeous pieces are under ***my*** *strict supervision*! *clears throat*--*inhales*-", new Discord.RichEmbed()
      .setAuthor("Templates")
      .setColor(0x00ff00)
      .setDescription("```css\n" + names.join("\n") + "```"));
    }
  }, "", "I can show you a neat list of all the art I've been asked to watch", false, new CommandMap()),
  new Command("info", [ "i", "mayicuridpls" ], message => true, function(message, args)
  {
    let guildData = getOrDefaultGuildData(getOrDefaultData().guildData, message.guild.id);
    if(args.length === 0) delayReply(message, "Which one are you thinking of exactly?^^ " + getEmojiOrDefault("", "curious"));
    else if(args.length > 1) delayReply(message, "Wow, that's a *lot* you want to hear about at once! Would you mind asking for about " + (args.length - 1) + " less images~? " + getEmojiOrDefault("", "sassy"));
    else
    {
      let name = args[0];
      if(name in guildData.regions)
      {
        let region = guildData.regions[name];
        delayReply(message, "Isn't this one just *so* wonderful? I *absolutely* ***love*** it-!* " + getEmojiOrDefault("", "talkative"), new Discord.RichEmbed()
        .setAuthor(name)
        .setColor(0xff1919)
        .setThumbnail(region.image)
        //.addField("Image: " + region.image , " - I need to know which image I'm looking after of course", false)
        .addField("Coordinates: (" + region.x + ", " + region.y + ")", " - That one *tiny* pixel at the top left corner of the image. Yep, these are its coordinates", false)
        .addField("Dimensions: " + region.pixels.length + "x" + region.pixels[0].length, " - The width and height of the image, *duh*"));
      }
      else
      {
        let names = Object.keys(guildData.regions);
        delayReply(message, "I-I can't find anything called " + name + ".. I'm looking, I'm looking-!" + (names.length > 0 ? " Why don't you try " + getRandomElement(names) + " though? It's one of my favorites!" : ""));
      }
    }
  }, "[name]", "I write down every *little* detail about *all* the art in order to be prepared. You can see my notes, no problem!^^", false, new CommandMap()) ])),
new Command("settings", [ "s", "knobs" ], message => true, function(message, args)
{
  let guildData = getOrDefaultGuildData(getOrDefaultData().guildData, message.guild.id);
  let settings = guildData.settings;
  delayReply(message, "Alright lemme just... Aha, this should be the list of *everything* I need to remember about this server. Nearly lost it " + getEmojiOrDefault("*shudders*", "uneasy"), new Discord.RichEmbed()
  .setAuthor("Settings")
  .setColor(0x8a24ff)
  .addField("Prefix: " + (settings.prefix ? settings.prefix : "None"), "- Apparently some ponies here are too shy to call me by name so they use this instead *giggles*", false)
  .addField("Input: " + (settings.input.length > 0 ? settings.input.map(id => "#" + client.channels.get(id).name).join(", ") : "None"), "- I should listen to commands here. I'm still gonna chat anywhere though^^ That's what discord is for, right?*", false)
  .addField("Output: " + (settings.output.length > 0 ? settings.output.map(id => "#" + client.channels.get(id).name).join(", ") : "None"), "- In order to not disturb anypony else, I'll report on the canvas here", false)
  .addField("Notifications: " + (settings.notifications.length > 0 ? settings.notifications.map(id => "@" + message.guild.roles.get(id).name).join(", ") : "None"), "- The canvas is very important to some ponies here!~ I'll make sure to keep them updated *personally*")
  .addField("Permissions: " + (settings.permissions.length > 0 ? settings.permissions.map(id => "@" + message.guild.roles.get(id).name).join(", ") : "None"), "- I don't want to cause any trouble so I should take advice only from these ponies-in-charge", false)
  .setFooter("By " + config.author + ", v" + config.version));
}, "[<command>]", "My memory isn't perfect so I *always* take notes about every server. I can show you everything about this server or write down your preferences*~", false, new CommandMap([
  new Command("prefix", [ "p" ], message => true, function(message, args)
  {
    let guildData = getOrDefaultGuildData(getOrDefaultData().guildData, message.guild.id);
    if(args.length === 0) delayReply((message, guildData.settings.prefix ? "I'm on the lookout for any of those " + guildData.settings.prefix + " messages*" : "I'm attentively waiting for you to call my name out^^") + " " + getEmojiOrDefault("", "delight"));
    else if(!hasPermission(message)) return;
    else if(args.length > 1) delayReply(message, "Oh my~ so *many* options, so **many** choices! How about you try again and offer me " + (args.length - 1) + " less options to choose from? " + getEmojiOrDefault("", "mischievous"));
    else
    {
      delayReply(message, "I will be paying.. *very close* attention to every one of your messages that starts with " + args[0] + " from this moment on*" + getEmojiOrDefault("", "curious"));
      guildData.settings.prefix = args[0];
      writeData();
    }
  }, "[<prefix>]", "I'll make sure to respond to any messages that start with this, just in case someone it too shy to call me by name. It can be any number of different characters, try it! It may also be faster this way, but I'll ignore this fact", false, new CommandMap([
    new Command("clear", [ "c" ], message => hasPermission(message), function(message, args)
    {
      delayReply(message, "Well well.. you'll have to adress me directly now if you want something*~");
      getOrDefaultGuildData(getOrDefaultData().guildData, message.guild.id).settings.prefix = "";
      writeData();
    }, "", "", false, new CommandMap()) ])),
  new Command("input", [ "i", "in" ], message => true, function(message, args)
  {
    let guildData = getOrDefaultGuildData(getOrDefaultData().guildData, message.guild.id);
    if(args.length === 0) delayReply(message, guildData.settings.input.length > 0 ? "I'm listening to you with utmost attention in <#" + guildData.settings.input.join(">, <#") + "> " + getEmojiOrDefault("", "positive") : "I'm free to snoop on all your conversations~! " + getEmojiOrDefault("", "mischievous"));
    else if(!hasPermission(message)) return;
    else
    {
      let accepted = [];
      let rejected = [];
      for(let a = 0, b = args.length; a < b; ++a)
      {
        let id = args[a];
        if(id.startsWith("<#") && id.endsWith(">")) id = id.slice(2, -1);
        if(message.guild.channels.has(id)) accepted.push(id);
        else rejected.push(args[a]);
      }
      delayReply(message, (accepted.length > 0 ? "I will be listening extra intently for you in <#" + accepted.join(">, <#") + "> from now on~ " + getEmojiOrDefault("", "curious") : "") + (rejected.length > 0 ? "I looked extra hard, promise, but " + rejected.join(", ") + (rejected.length === 1 ? " is" : " are") + " nowhere to be found" + (accepted.length > 0 ? " though..!" : "..!") : ""));
      if(accepted.length === 0) return;
      guildData.settings.input = accepted;
      writeData();
    }
  }, "[<channels>]", "Sometimes I tend to get carried away and talk *a lot*, so I can respond to commands only in certain channels* if you list their links for me. I'm happy to talk to you about anything anywhere though~!", false, new CommandMap([
    new Command("clear", [ "c" ], message => hasPermission(message), function(message, args)
    {
      let guildData = getOrDefaultGuildData(getOrDefaultData().guildData, message.guild.id);
      if(guildData.settings.input && guildData.settings.input.length > 0)
      {
        delayReply(message, "I can now listen to you from anywhere-!");
        guildData.settings.input = [];
        writeData();
      }
      else delayReply(message, "I can ***still*** eavesdrop on you~ " + + getEmojiOrDefault("*hehe*", "mischievous"));
    }, "", "If nopony minds me responding to requests *anywhere*, then no problem!^^", false, new CommandMap()) ])),
  new Command("output", [ "o", "out" ], message => true, function(message, args)
  {
    let guildData = getOrDefaultGuildData(getOrDefaultData().guildData, message.guild.id);
    if(args.length === 0) delayReply(message, guildData.settings.output.length > 0 ? "I've been told to report anything that looks dangerous in <#" + guildData.settings.output.join(">, <#") + "> " + getEmojiOrDefault("", "talkative") : "I have nowhere to alert anypony anymore.. " + getEmojiOrDefault("", "unhappy"));
    else if(!hasPermission(message)) return;
    else
    {
      let accepted = [];
      let rejected = [];
      for(let a = 0, b = args.length; a < b; ++a)
      {
        let id = args[a];
        if(id.startsWith("<#") && id.endsWith(">")) id = id.slice(2, -1);
        if(message.guild.channels.has(id)) accepted.push(id);
        else rejected.push(args[a]);
      }
      delayReply(message, (accepted.length > 0 ? "I will alert <#" + accepted.join(">, <#") + "> in case of an emergency starting right about now! " + getEmojiOrDefault("", "talkative") + " " : "") + (rejected.length > 0 ? "I can't find " + rejected.join(", ") + " anywhere around here" + (accepted.length > 0 ? " though-.." : "-..") + getEmojiOrDefault("", "thonk") : ""));
      if(accepted.length === 0) return;
      guildData.settings.output = accepted;
      writeData();
    }
  }, "[<channels>]", "I can't alert every single channel just like that! I can however update a few specific channels, no problem. Just show me a list of all the links to channels that must be notified", false, new CommandMap([
    new Command("clear", [ "c" ], message => hasPermission(message), function(message, args)
    {
      let guildData = getOrDefaultGuildData(getOrDefaultData().guildData, message.guild.id);
      if(guildData.settings.output && guildData.settings.output.length > 0)
      {
        guildData.settings.output = [];
        delayReply(message, "B-but where will I alert everypony now-? " + getEmojiOrDefault("", "worried"));
        writeData();
      }
      else delayReply(message, "There's nowhere for me to alert anypony in case of an attack-.. Will you allow me to do that somewhere?~ " + getEmojiOrDefault("", "hopeful"));
    }, "", "I can *stop* notifying everypony too.- I hope I'm not being annoying v.v", false, new CommandMap()) ])),
  new Command("notifications", [ "r", "thesquad" ], message => true, function(message, args)
  {
    let guildData = getOrDefaultGuildData(getOrDefaultData().guildData, message.guild.id);
    if(args.length === 0) delayReply(message, guildData.settings.notifications.length > 0 ? "I'm reporting anything *dangerous* or ***nasty*** to all the <@&" + guildData.settings.notifications.join(">, <@&") + ">, yeah!" : (guildData.settings.output.length > 0 ? "Oh I'm currently reporting trouble to <#" + guildData.settings.output.join(">, <#") + ">, but to no pony *in particular*^^ " + getEmojiOrDefault("", "positive") : "Well I've been told to report nothing for now (*whispering* and hopefully not for very long) " + getEmojiOrDefault("", "unhappy")));
    else if(!hasPermission(message)) return;
    else
    {
      let accepted = [];
      let rejected = [];
      for(let a = 0, b = args.length; a < b; ++a)
      {
        let id = args[a];
        if(id.startsWith("<@&") && id.endsWith(">")) id = id.slice(3, -1);
        if(message.guild.roles.has(id)) accepted.push(id);
        else rejected.push(args[a]);
      }
      delayReply(message, (accepted.length > 0 ? "I'll make sure to alert <@&" + accepted.join(">, <@&") + "> now if something goes wrong, I promise! " + getEmojiOrDefault("", "positive") : "") + (rejected.length > 0 ? "Are you sure that " + rejected.join(", ") + " are in their natural habitat here*? Because I sure can't see any around-.. " + getEmojiOrDefault("", "confused") : ""));
      if(accepted.length === 0) return;
      guildData.settings.notifications = accepted;
      writeData();
    }
  }, "[<roles>]", "I think it's very important to inform our brave fighters that dedicate their time to protect our art. I'll write everything down if you mention the roles", false, new CommandMap([
    new Command("clear", [ "clear" ], message => hasPermission(message), function(message, args)
    {
      let guildData = getOrDefaultGuildData(getOrDefaultData().guildData, message.guild.id);
      if(guildData.settings.notifications && guildData.settings.notifications.length > 0)
      {
        delayReply(message, "I guess I won't alert anypony *specifically* then-~ " + getEmojiOrDefault("", "confused"));
        guildData.settings.notifications = [];
        writeData();
      }
      else delayReply(message, "Oh, but I already don't have anypony to warn *for now* " + getEmojiOrDefault("", "unhappy"));
    }, "", "The constant notifications can sometimes be too much, that's true. I can stop notifying specific roles", false, new CommandMap()) ])),
  new Command("permissions", [ "m", "mods", "almightygang" ], message => true, function(message, args)
  {
    let guildData = getOrDefaultGuildData(getOrDefaultData().guildData, message.guild.id);
    if(args.length === 0) delayReply(message, guildData.settings.permissions.length > 0 ? "Yeah, uhh, I remember-.. *glances at list* <@&" + guildData.settings.permissions.join(">, <@&") + "> are the VIPs! " + getEmojiOrDefault("", "positive") : "I guess everything's up to the administrators *huh* " + getEmojiOrDefault("", "thonk"));
    else if(!hasPermission(message)) return;
    else
    {
      let accepted = [];
      let rejected = [];
      for(let a = 0, b = args.length; a < b; ++a)
      {
        let id = args[a];
        if(id.startsWith("<@&") && id.endsWith(">")) id = id.slice(3, -1);
        if(message.guild.roles.has(id)) accepted.push(id);
        else rejected.push(args[a]);
      }
      delayReply(message, (accepted.length > 0 ? "Sure^^, I'll gladly take any advice from <@&" + accepted.join(">, <@&") + ">! " + getEmojiOrDefault("", "curious") + " " : "") + (rejected.length > 0 ? "I've asked everypony here and no pony seems to know about " + rejected.join(", ") + (accepted.length > 0 ? " though" : "") + getEmojiOrDefault("", "confused") : ""));
      if(accepted.length === 0) return;
      guildData.settings.permissions = accepted;
      writeData();
    }
  }, "[<roles>]", "The admins are *very busy* ponies and can't always give me advice, you know! If you want anypony to fill in for them, just give me a list of role mentions^^", false, new CommandMap([
    new Command("clear", [ "c" ], message => hasPermission(message), function(message, args)
    {
      let guildData = getOrDefaultGuildData(getOrDefaultData().guildData, message.guild.id);
      if(guildData.settings.permissions && guildData.settings.permissions.length > 0)
      {
        let numberOfUsers = guildData.settings.permissions.map(id => message.guild.roles.get(id).members.size).reduce((total, value) => total + value);
        delayReply(message, "Crossing " + numberOfUsers + " users off my list... A-a-a-nd done-! " + (numberOfUsers === 0 ? "lol! " : "") + getEmojiOrDefault("", "mischievous"));
        guildData.settings.permissions = [];
        writeData();
      }
      else delayReply(message, "Actually I'm pretty sure my list already empty*, other than you admins of course^^");
    }, "", "I can stop listening to the moderators if they're up to no good", false, new CommandMap()) ])),
  new Command("clear", [ "c" ], message => hasPermission(message), function(message, args)
  {
    delayReply(message, (args.length > 0 ? "You really didn't need to tell me that " + args.join(" ") + ".. " + getEmojiOrDefault("", "confused") : "") + "Hey, are you sure you don't want to keep at least something? I guess you don't, otherwise you wouldn't have asked-~");
    getOrDefaultGuildData(getOrDefaultData().guildData, message.guild.id).settings = {};
    writeData();
  }, "", "Tossing out everything I've written down about this server is also something I can do*", false, new CommandMap()) ])) ]);

  /*
  new Command("learn", [ "l" ], message => hasPermission(message), function(message, args)
  {
    message.guild.channels.forEach(function(channel, id, map)
    {
      if(channel.type !== "text") return;
      getChannelMessages(channel, function(messages, error)
      {
        if(error) return;
        let stream = new Readable();
        messages.forEach(function(message1, id1, map1)
        {
          if(!isBot(message1.author) && message1.content) stream.push(message1.content + "\n");
        });
        stream.push(null);
        stream.pipe(fs.createWriteStream("./data/sets/" + message.guild.id + ".txt"));
      });
    });
  }, "", "", new CommandMap())
  */

let privateCommandsByName = new CommandMap([
new Command("message", [ "m" ], message => isOwner(message.author), function(message, args)
{
  message.reply("AYE");
}, "", "", true, new CommandMap([
  new Command("channel", [ "c" ], message => true, function(message, args)
  {
    if(args.length > 2) delayMessage(client.guilds.get(args[0]).channels.get(args[1]), args.slice(2).join(" "), { files: copyAttachments(message) });
  }, "", "", true, new CommandMap()),
  new Command("user", [ "u" ], message => true, function(message, args)
  {
    if(args.length > 1) client.fetchUser(args[0]).then(function(user)
    {
      getOrCreateDM(user, channel => delayMessage(channel, args.slice(1).join(" "), { files: copyAttachments(message) }));
    }).catch(function(error)
    {
      console.log(error);
    });
  }, "", "", true, new CommandMap()) ])) ]);

function isOwner(user)
{
  return user.id === config.discord.owner;
}

function isBot(user)
{
  return user.id === client.user.id;
}

// TODO Clean all other settings too
client.on("ready", function()
{
  console.log("Logged in as " + client.user.tag);
  client.user.setActivity("for @mentions", { type: "WATCHING" });
  let guildData = getOrDefaultData().guildData;
  for(let a in guildData)
  {
    if(client.guilds.has(a)) guildData[a].settings.input = guildData[a].settings.input.filter(channel => client.guilds.get(a).channels.has(channel.id));
    else delete guildData[a];
  }
  let data = getOrDefaultData();
  if(new Date().getTime() - data.timestamps.disconnect > config.discord.cooldowns.connectMessage) client.guilds.forEach((guild, id, map) => alertGuild(guild, "*Yaaawns*~ Sorry everypony!~ Looks like I totally overworked myself and zoned out-.. I'm feeling better now though! " + getEmojiOrDefault("", "positive")));
});

client.on("message", function(message)
{
  if(isBot(message.author)) return;
  let args = message.content.split(" ");
  if(!message.guild) parseDirectMessage(message);
  else
  {
    let guildData = getOrDefaultGuildData(getOrDefaultData().guildData, message.guild.id);
    if(guildData.settings.input && guildData.settings.input.length > 0 && !guildData.settings.input.includes(message.channel.id)) parseMessage(message);
    else
    {
      if(guildData.settings.prefix && args[0].startsWith(guildData.settings.prefix)) runCommand(commandsByName, message, args[0].substring(guildData.settings.prefix.length), args.slice(1), true);
      else if(args[0] !== "<@" + client.user.id + ">" || !runCommand(commandsByName, message, args[1], args.slice(2), false)) parseMessage(message);
    }
  }
});

client.on("reconnecting", function()
{
  console.log("Reconnecting");
});

client.on("disconnect", function()
{
  console.log("Disconnected");
});

client.on("guildCreate", function(guild)
{
  console.log("Joined " + guild.name + " (" + guild.id + ")");
  alertGuild(guild, "Hey everypony! Thank you so much for inviting me!* I'm so glad to be here and I can't wait to meet you all!^^ " + getEmojiOrDefault("", "delight") + " " + getAboutMessage());
});

client.on("guildDelete", function(guild)
{
  console.log("Left " + guild.name + " (" + guild.id + ")");
  if(!(guild.id in getOrDefaultData().guildData)) return;
  delete savedData.guildData[guild.id];
  writeData();
});

client.on("channelDelete", function(channel)
{
  let guildData = getOrDefaultGuildData(getOrDefaultData().guildData, channel.guild.id);
  for(let a = 0, b = guildData.settings.input.length; a < b; ++a) guildData.settings.input = guildData.settings.input.filter(element => element.id === channel.id);
});

client.login(auth.discord);

function alertGuild(guild, text, extra)
{
  if(guild.systemChannel) delayMessage(guild.systemChannel, text, extra);
  else
  {
    let guildData = getOrDefaultGuildData(getOrDefaultData().guildData, guild.id);
    for(let a = 0, b = guildData.settings.output.length; a < b; ++a) delayMessage(client.channels.get(guildData.settings.output[a]), text, extra);
  }
}

function hasPermission(message)
{
  return isOwner(message.author) || message.member.hasPermission("ADMINISTRATOR") || getOrDefaultGuildData(getOrDefaultData().guildData, message.guild.id).settings.permissions.some(id => message.member.roles.has(id));
}

function runCommand(map, message, name, args, alert)
{
  let commandPair = findCommand(map, message, name, args);
  if(commandPair)
  {
    let command = commandPair[0];
    if(command.canRun(message))
    {
      if(command.guildless || message.guild) command.run(message, commandPair[1]);
      else if(alert) delayReply(message, "Haha^^ I can only help you with that on a server~");
    }
    return true;
  }
  else if(alert) delayReply(message, (name ? "Well, um, I'm not sure what you mean by " + name + " exactly.. " : "You didn't finish your sentence.. Carry on~ ") + getEmojiOrDefault("", "thonk") + " " + (message.guild ? getHelpMessage(message.guild.id) : ""));
  return false;
}

function findCommand(map, message, name, args)
{
  if(map.has(name))
  {
    let commandPair = [map.get(name), args];
    let subCommandPair = findCommand(commandPair[0].subCommandMap, message, args[0], args.slice(1));
    if(args.length === 0 || !subCommandPair) return commandPair;
    else return subCommandPair;
  }
  return null;
}

function formatMessage(message)
{
  let text = message.content;
  let links = text.match(/\<(.*?)\>/g);
  if(links) for(let a = 0, b = links.length; a < b; ++a)
  {
    let link = links[a];
    if(link.charAt(1) === "@")
    {
      if(link.charAt(2) !== "&")
      {
        let user = client.users.get(link.slice(2, -1));
        text = text.replace(link, user ? user.username : "");
      }
      else if(message.guild)
      {
        let role = message.guild.roles.get(link.slice(3, -1));
        text = text.replace(link, role ? role.name : "");
      }
    }
    else if(link.charAt(1) === "#")
    {
      let channel = message.guild.channels.get(link.slice(2, -1));
      text = text.replace(link, channel && channel.name ? channel.name : "");
    }
  }
  return text;
}

function queueGpt2Message(message)
{
  let lines = formatMessage(message).split("\n");
  gpt2.stdin.write("lines=" + lines.length + ";user=" + message.author.id + ";channel=" + message.channel.id + "\n");
  for(let a = 0, b = lines.length; a < b; ++a) gpt2.stdin.write(lines[a] + "\n");
  message.channel.startTyping();
}

// TODO regarding twilight sparkle copypasta
// TODO Cadence ship
function parseMessage(message)
{
  if(message.content.includes("<@" + client.user.id + ">")) return queueGpt2Message(message);
  let text = formatMessage(message).toLowerCase();
  let time = new Date().getTime();
  let guildData = getOrDefaultGuildData(getOrDefaultData().guildData, message.guild.id);
  let userData = getOrDefaultUserData(guildData.userData, message.author.id);
  if(time - guildData.timestamps.h > config.discord.cooldowns.h && text === "h")
  {
    delayMessage(message.channel, "h");
    guildData.timestamps.h = time;
    writeData();
  }
  else if(time - userData.timestamps.track > config.discord.cooldowns.track && (text.includes("pon") || text.includes("hors") || text.includes("mlp") || text.includes("bron")) && (text.includes("song") || text.includes("track") || text.includes("chune") || text.includes("tune") || text.includes("music") || text.includes("edm")))
  {
    getYTPlaylistItems(function(items, error)
    {
      delayMessage(message.channel, "Did somepony mention *music*-? ***Pony music***~?! You have *no idea* how much it fascinates me! *rummages through her saddlebags* Here's one of my favorites, check it out! https://www.youtube.com/watch?v=" + getRandomElement(items).contentDetails.videoId);
    });
    userData.timestamps.track = time;
    writeData();
  }
  else if(time - userData.timestamps.art > config.discord.cooldowns.art && (text.includes("pon") || text.includes("hors") || text.includes("mlp") || text.includes("bron")) && (text.includes("art")))
  {
    getDAFolderItems(function(items, error)
    {
      delayMessage(message.channel, "Oh, I know a little about fanart. Here, doesn't this look *absolutely* ***stunning***? " + getRandomElement(items).url);
    });
    userData.timestamps.art = time;
    writeData();
  }
  else if(time - userData.timestamps.copypasta > config.discord.cooldowns.copypasta)
  {
    if(text.includes("i'll have you know") || text.includes("what the fuck did you just fucking say about"))
    {
      delayMessage(message.channel, getRandomElement(["What the fuck did you just fucking say about My Little Pony, you bucking foal? I’ll have you know it's ranked top out of all the shows on the Hub, and it has been won numerous awards, and has over 300 thousand confirmed fans. Lauren Faust is trained in sociology and has the top team in the entire cartoon industry. You are nothing to them but just another target. They will wipe you the fuck out with precision the likes of which has never been seen before on this subreddit, mark my bucking words. You think you can get away with saying that shit about My Little Pony over the Internet? Think again, fucker. As we speak this I am contacting my secret network of bronies across the USA and your IP is being doxxed right now so you better prepare for the friendship cannon, coltcuddler. The friendship that wipes out the pathetic little thing you call your life. You’re bucking dead, foal. Navy Seal copypastas can be anywhere, anytime, and they can confuse you in over seven hundred ways, and that’s just with mad-lib permutations. Not only are they extensively trained in trolling, but they have access to the entire arsenal of Anonymous and will use it to its full extent to wipe your miserable ass off the face of the Internet, you little shit. If only you could have known what chaotic retribution your little “clever” comment was about to bring down upon you, maybe you would have held your bucking muzzle. But you couldn’t, you didn’t, and now you’re paying the price, you goddamn canter. I will shit love and tolerance all over you and you will drown in it. You’re bucking dead, kiddo", "What the fuck did you just fucking say about me, you little pony? I’ll have you know I graduated top of my class in magic kindergarten, and I’ve been involved in numerous secret raids on Nightmare Moon, and I have over 300 confirmed friendships. I am trained in magic warfare and I’m the top pony in the entire Equestrian armed forces. You are nothing to me but just another friend. I will wipe you the fuck out with friendship the likes of which has never been seen before on Equestria, mark my fucking words. You think you can get away with saying that shit to me over the Ponynet? Think again, fucker. As we speak I am contacting my secret network of pegasi across Equestria and your hoofprints are being traced right now so you better prepare for the storm, maggot. The storm that wipes out the pathetic little thing you call your life. You’re fucking dead, pony. I can be anywhere, anytime, and I can hug you in over seven hundred ways, and that’s just with my bare hooves. Not only am I extensively trained in unarmed friendship, but I have access to the entire arsenal of ponies and I will use it to its full extent to wipe your miserable flank off the face of the continent, you little pony. If only you could have known what magical friendship your little “clever” comment was about to bring down upon you, maybe you would have held your fucking tongue. But you couldn’t, you didn’t, and now you’re paying the price, you goddamn pony. I will shit friendship all over you and you will drown in it. You’re fucking dead, pony"]));
      userData.timestamps.copypasta = time;
      writeData();
    }
    else if(text.includes("tragedy") || text.includes("plagueis") || text.includes("darth") || text.includes("ironic"))
    {
      delayMessage(message.channel, "Did you ever hear the tragedy of Darth Plagueis The Wise? I thought not. It's not a story the Jedi would tell you. It's a Sith legend. Darth Plagueis was a Dark Lord of the Sith, so powerful and so wise he could use the Force to influence the midichlorians to create life… He had such a knowledge of the dark side that he could even keep the ones he cared about from dying. The dark side of the Force is a pathway to many abilities some consider to be unnatural. He became so powerful… the only thing he was afraid of was losing his power, which eventually, of course, he did. Unfortunately, he taught his apprentice everything he knew, then his apprentice killed him in his sleep. Ironic. He could save others from death, but not himself");
      userData.timestamps.copypasta = time;
      writeData();
    }
    else if(text.includes("linux") || text.includes("interject") || text.includes("gnu"))
    {
      delayMessage(message.channel, "I'd just like to interject for a moment. What you're referring to as Linux, is in fact, GNU/Linux, or as I've recently taken to calling it, GNU plus Linux. Linux is not an operating system unto itself, but rather another free component of a fully functioning GNU system made useful by the GNU corelibs, shell utilities and vital system components comprising a full OS as defined by POSIX.\nMany computer users run a modified version of the GNU system every day, without realizing it.  Through a peculiar turn of events, the version of GNU which is widely used today is often called Linux, and many of its users are not aware that it is basically the GNU system, developed by the GNU Project.\nThere really is a Linux, and these ponies are using it, but it is just a part of the system they use.  Linux is the kernel: the program in the system that allocates the machine's resources to the other programs that you run. The kernel is an essential part of an operating system, but useless by itself; it can only function in the context of a complete operating system. Linux is normally used in combination with the GNU operating system: the whole system is basically GNU with Linux added, or GNU/Linux.  All the so-called Linux distributions are really distributions of GNU/Linux.")
      userData.timestamps.copypasta = time;
      writeData();
    }
    else if(text.includes("who") && text.includes("was") && text.endsWith("?"))
    {
      delayMessage(message.channel, "Then WHO WAS PHONE?");
      userData.timestamps.copypasta = time;
      writeData();
    }
	/*
    else if(+text.length <= +40 && (text.includes("wtf") || text.includes("the hell") || text.includes("the fuck") || text.includes("wat")))
    {
      delayMessage(message.channel, "Has anypony really been far even as decided to use even go want to do look more like? " + getEmojiOrDefault("", "thonk"));
      userData.timestamps.copypasta = time;
      writeData();
    }
	*/
    else if(text.includes("27") || text.includes("legend"))
    {
      delayMessage(message.channel, "Is it TheLegend27?!");
      userData.timestamps.copypasta = time;
      writeData();
    }
  }
}

function parseDirectMessage(message)
{
  let args = message.content.split(" ");
  if(!isOwner(message.author)) runCommand(commandsByName, message, args[0], args.slice(1), true);
  else runCommand(privateCommandsByName, message, args[0], args.slice(1), true);
}

function copyAttachments(message)
{
  return message.attachments.map((value, key, map) => ({ attachment: value.url, name: value.fileName }));
}

function getOrDefaultData()
{
  let timestamps = "timestamps" in savedData ? savedData.timestamps : {};
  savedData.timestamps = timestamps;
  if(!("disconnect" in timestamps)) timestamps.disconnect = 0;
  if(!("guildData" in savedData)) savedData.guildData = {};
  return savedData;
}

function getOrDefaultGuildData(dataByGuild, id)
{
  let guildData = id in dataByGuild ? dataByGuild[id] : {};
  dataByGuild[id] = guildData;
  if(!("regions" in guildData)) guildData.regions = {};
  let settings = "settings" in guildData ? guildData.settings : {};
  guildData.settings = settings;
  if(!("prefix" in settings)) settings.prefix = "";
  if(!("input" in settings)) settings.input = [];
  if(!("output" in settings)) settings.output = [];
  if(!("notifications" in settings)) settings.notifications = [];
  if(!("permissions" in settings)) settings.permissions = [];
  let timestamps = "timestamps" in guildData ? guildData.timestamps : {};
  guildData.timestamps = timestamps;
  if(!("h" in timestamps)) timestamps.h = 0;
  if(!("alert" in timestamps)) timestamps.alert = 0;
  if(!("userData" in guildData)) guildData.userData = {};
  return guildData;
}

function getOrDefaultUserData(dataByUser, id)
{
  let userData = id in dataByUser ? dataByUser[id] : {};
  dataByUser[id] = userData;
  let timestamps = "timestamps" in userData ? userData.timestamps : {};
  userData.timestamps = timestamps;
  if(!("track" in timestamps)) timestamps.track = 0;
  if(!("art" in timestamps)) timestamps.art = 0;
  if(!("copypasta" in timestamps)) timestamps.copypasta = 0;
  return userData;
}

function getHelpMessage(id)
{
  let guildData = getOrDefaultGuildData(getOrDefaultData().guildData, id);
  return "Type <@" + client.user.id + "> help" + (guildData.settings.prefix ? " or " + guildData.settings.prefix + "help" : "") + " if you're stuck or want to learn more about me mhm";
}

function getAboutMessage()
{
  return "My name is " + client.user.username + ", I was created by " + config.author + " and I'm partly powered by a trained GPT-2 " + config.gpt2.model + " model, a neural network model by OpenAI. I'd be more than happy to chat about anything with you if you @call my name first. Please don't spam though, I can get very overwhelmed sometimes^^. I'm okay with a command prefix too, if you'd prefer that instead ;D I can do lots of cool things for you so don't be afraid to ask me for some help. I must admit that I've picked up a bit habit of eavesdropping and cutting into other ponies' conversations " + getEmojiOrDefault("*hehe*", "mischievous");
}

snekfetch.get("http://skelux.net/inc/plugins/place/place_fast.bin").then(function(response)
{
  let data = bzip2.simple(bzip2.array(new Uint8Array(response.body))).split("/");
  lastID = data[0];
  size = data[1];
  // Initializes a 2d array of colors filled with undefined values with some headroom for expansion
  loadedPixels = [...Array(+size + 100)].map(element => Array(+size + 100));
  for (let a = 2; a < data.length; ++a)
  {
    let color = data[a];
    if(!color) continue;
    loadedPixels[(a - 2) % size][Math.floor((a - 2) / size)] = color;
  }
  console.log("Read canvas of size " + size);
  setInterval(function()
  {
    let time = new Date().getTime();
    if(!reading || (time - lastRead) >= config.timeout) readPixels();
    getOrDefaultData().timestamps.disconnect = time;
    writeData();
  }, config.anotherPlace.updateInterval);
}).catch(function(error)
{
  console.log(error);
});

//fs.mkdir("./data", { recursive: true }, function(error)
fs.readFile("./data/data.json", "utf-8", function(error, data)
{
  if(error) return console.log(error);
  if(!data) return;
  savedData = JSON.parse(data);
  for(let a in savedData.guildData) for(let b in savedData.guildData[a].regions) loadPNG(savedData.guildData[a].regions[b].image, (pixels, error) => savedData.guildData[a].regions[b].pixels = pixels);
});

function writeData()
{
  let stream = new Readable();
  stream.push(JSON.stringify(savedData, (key, value) => key === "pixels" ? undefined : value, "\t"));
  stream.push(null);
  stream.pipe(fs.createWriteStream("./data/data.json"));
}

function loadPNG(url, callback)
{
  snekfetch.get(url).then(function(response)
  {
    new PNG().parse(response.body, function(error, imageData)
    {
      // Creates a 2d array
      let pixels = [...Array(+imageData.width)].map(element => Array(+imageData.height));
      let colorData = new Uint8Array(imageData.data);
      let index = 0;
      for(let y = 0; y < imageData.height; ++y) for(let x = 0; x < imageData.width; ++x)
      {
        if(colorData[index + 3] === 255) pixels[x][y] = hexToAP(rgbToHex(colorData[index], colorData[index + 1], colorData[index + 2]));
        index += 4;
      }
      callback(pixels, error);
    });
  }).catch(function(error)
  {
    callback(null, error);
    console.log(error);
  });
}

function composePNG(pixels)
{
  let png = new PNG(
  {
    width: pixels.length,
    height: pixels[0].length
  });
  let index = 0;
  for(let y = 0, b = pixels[0].length; y < b; ++y) for(let x = 0, a = pixels.length; x < a; ++x)
  {
    let color = pixels[x][y];
    if(color) color = hexToRGB(apToHex(color));
    if(!color) color = [255, 255, 255, 0];
    png.data[index] = color[0];
    png.data[index + 1] = color[1];
    png.data[index + 2] = color[2];
    png.data[index + 3] = color[3];
    index += 4;
  }
  return png;
}

function addPixel(id, color, x, y)
{
  let time = new Date().getTime();
  let guildData = getOrDefaultData().guildData;
  for(let a in guildData)
  {
    let endangeredRegions = [];
    for(let b in guildData[a].regions) if(contains(guildData[a].regions[b].x, guildData[a].regions[b].y, guildData[a].regions[b].pixels.length, guildData[a].regions[b].pixels[0].length, x, y, 1, 1) && color !== guildData[a].regions[b].pixels[+x - +guildData[a].regions[b].x][+y - +guildData[a].regions[b].y] && loadedPixels[x][y] === guildData[a].regions[b].pixels[+x - +guildData[a].regions[b].x][+y - +guildData[a].regions[b].y]) endangeredRegions.push(b);
	if(endangeredRegions.length === 0 || time - guildData[a].timestamps.alert <= config.discord.cooldowns.alert) continue;
    guildData[a].timestamps.alert = time;
    writeData();
    for(let c = 0, d = guildData[a].settings.output.length; c < d; ++c)
    {
      let coords = "(" + x + ", " + y + ")";
      let response1 = (guildData[a].settings.notifications.length > 0 ? "<@&" + guildData[a].settings.notifications.join(">, <@&") + ">" : "") + " " + endangeredRegions.join(", ") + (endangeredRegions.length === 1 ? " is " : " are ") + "*under* ***attack*** at " + coords + "! Somebody.. Do someTHING!!";
      let response2 = endangeredRegions.join(", ") + (endangeredRegions.length === 1 ? " is " : " are ") + "***not*** having a good time at " + coords + " right now! " + (guildData[a].settings.notifications.length > 0 ? "<@&" + guildData[a].settings.notifications.join(">, <@&") + ">" : "") + " We need support *right now*!";
      let response3 = "*Wake* ***up*** " + (guildData[a].settings.notifications.length > 0 ? "<@&" + guildData[a].settings.notifications.join(">, <@&") + ">" : "everypony") + "! " + endangeredRegions.join(", ") + (endangeredRegions.length === 1 ? " is " : " are ") + "being ***raided*** at " + coords + "!!";
      let response4 = (guildData[a].settings.notifications.length > 0 ? "<@&" + guildData[a].settings.notifications.join(">, <@&") + ">" : "") + endangeredRegions.join(", ") + (endangeredRegions.length === 1 ? " is " : " are ") + "taking fire at " + coords + " and require" + (endangeredRegions.length === 1 ? "s" : "") + " *immediate* ***support***.!!";
      delayMessage(client.channels.get(guildData[a].settings.output[c]), getRandomElement([response1, response2, response3, response4]));
    }
  }
  if(id > lastID) lastID = id;
  loadedPixels[x][y] = color;
}

// Rect 1 contains rect2
function contains(x1, y1, width1, height1, x2, y2, width2, height2)
{
  return +x1 <= +x2 && +y1 <= +y2 && +x1 + +width1 >= +x2 + +width2 && +y1 + +height1 >= +y2 + +height2;
}

function intersects(x1, y1, width1, height1, x2, y2, width2, height2)
{
  return +x1 + +width1 > +x2 && +x2 + +width2 > +x1 && +y1 + +height1 > +y2 && +y2 + +height2 > +y1;
}

function readPixels()
{
  reading = true;
  lastRead = new Date().getTime();
  let options =
  {
    data:
    {
      rs: "readPixels",
      rst: "",
      rsrnd: lastRead,
      "rsargs[]": lastID
    },
    headers:
    {
      "Method": "POST /place.php HTTP/1.1",
      "Content-Type": "application/x-www-form-urlencoded",
      "Origin": "http://skelux.net"
    }
  };
  let req = snekfetch.post("http://skelux.net/place.php", options).then(function(response)
  {
    let receivedPixels = reverseObject(eval(response.text.substring(2)));
    for(let a in receivedPixels) addPixel(receivedPixels[a][0], receivedPixels[a][1].substring(1), receivedPixels[a][2], receivedPixels[a][3]);
    reading = false;
  }).catch(function(error)
  {
    console.log(error);
    reading = false;
  });
}

function delayReply(message, text, extra)
{
  message.channel.startTyping();
  setTimeout(function()
  {
    message.reply(text, extra);
    message.channel.stopTyping();
  }, config.discord.messageDelay);
}

function delayMessage(channel, text, extra)
{
  channel.startTyping();
  setTimeout(function()
  {
    channel.send(text, extra);
    channel.stopTyping();
  }, config.discord.messageDelay);
}

function getEmojiOrDefault(defaultValue, category)
{
  if(Math.random() < config.discord.emojiChance)
  {
    switch(category)
    {
      case "positive": return getRandomElement([ "<a:ilikeurmug:600428391442808837>", "<a:awurlydidnthavetom8:600411939918577943>" ]);
      case "neutral": return getRandomElement([ "<a:swiggity:600426860677038100>", "<a:lmaooicanteven:600436603885977602>", "<a:ideadotjpeg:600426958010056767>", "<a:bigthonk:600439182044954635>", "<a:oshitbrowtf:600411914203430948>" ]);
      case "negative": return getRandomElement([ "<a:wtfuwantbroits4am:600433289970319382>", "<a:uwotmate:600411743008587852>", "<a:ucanleavenow:600411796914044944>" ]);
      case "delight": return getRandomElement([ "<a:lmaooicanteven:600436603885977602>", "<a:ilikeurmug:600428391442808837>", "<a:awurlydidnthavetom8:600411939918577943>" ]);
      case "weird": return getRandomElement([ "<a:swiggity:600426860677038100>", "<a:oshitbrowtf:600411914203430948>" ]);
      case "curious": return getRandomElement([ "<a:ilikeurmug:600428391442808837>", "<a:ideadotjpeg:600426958010056767>" ]);
      case "irritated": return getRandomElement([ "<a:wtfuwantbroits4am:600433289970319382>", "<a:uwotmate:600411743008587852>" ]);
      case "confused": return getRandomElement([ "<a:swiggity:600426860677038100>", "<a:oshitbrowtf:600411914203430948>", "<a:bigthonk:600439182044954635>" ]);
      case "uneasy": return getRandomElement([ "<a:oshitbrowtf:600411914203430948>", "<a:awurlydidnthavetom8:600411939918577943>" ]);
      case "mischievous": return getRandomElement([ "<a:lmaooicanteven:600436603885977602>", "<a:ideadotjpeg:600426958010056767>" ]);
      case "unhappy": return getRandomElement([ "<a:ucanleavenow:600411796914044944>", "<a:oshitbrowtf:600411914203430948>" ]);
      case "hopeful": return getRandomElement([ "<a:ideadotjpeg:600426958010056767>", "<a:awurlydidnthavetom8:600411939918577943>" ]);
      case "dismissive": return "<a:ucanleavenow:600411796914044944>";
      case "thonk": return "<a:bigthonk:600439182044954635>";
      case "funny": return "<a:lmaooicanteven:600436603885977602>";
      case "sassy": return "<a:oshitbrowtf:600411914203430948>";
      case "worried": return "<a:uwotmate:600411743008587852>";
      case "happysad": return "<a:awurlydidnthavetom8:600411939918577943>";
      case "talkative": return "<a:ilikeurmug:600428391442808837>";
      default: return getRandomElement([ "<a:wtfuwantbroits4am:600433289970319382>", "<a:uwotmate:600411743008587852>", "<a:ucanleavenow:600411796914044944>", "<a:swiggity:600426860677038100>", "<a:oshitbrowtf:600411914203430948>", "<a:lmaooicanteven:600436603885977602>", "<a:ilikeurmug:600428391442808837>", "<a:ideadotjpeg:600426958010056767>", "<a:bigthonk:600439182044954635>", "<a:awurlydidnthavetom8:600411939918577943>" ]);
    }
  }
  return defaultValue;
}

function getOrCreateDM(user, callback)
{
  if(!user.dmChannel) user.createDM().then(channel => callback(channel, null)).catch(function(error)
  {
    callback(null, error);
    console.log(error);
  });
  else callback(user.dmChannel, null);
}

function getChannelMessages(channel, callback)
{
  let messages = new Discord.Collection();
  let getNextBatch = function(nextBatch, error)
  {
    if(error) callback(null, error);
    else
    {
      messages = messages.concat(nextBatch);
      if(nextBatch.size === 100) getChannelBatch(channel, getNextBatch, messages.last().id);
      else callback(messages, null);
    }
  };
  getChannelBatch(channel, getNextBatch);
}

function getChannelBatch(channel, callback, id)
{
  let options = { limit: 100 };
  if(id) options.before = id;
  channel.fetchMessages(options).then(function(messages)
  {
    callback(messages, null);
  }).catch(function(error)
  {
    callback(null, error);
    console.log(error);
  });
}

function getDAFolderItems(callback)
{
  let options =
  {
    query:
    {
      grant_type: "client_credentials",
      client_id: auth.deviantart.id,
      client_secret: auth.deviantart.secret
    }
  };
  snekfetch.get("https://www.deviantart.com/oauth2/token", options).then(function(response)
  {
    let items = [];
    let getPage = function(pageOffset)
    {
      let options1 =
      {
        query:
        {
          access_token: response.body.access_token,
          username: config.discord.deviantart.username,
          limit: 24
        }
      };
      if(pageOffset) options1.query.offset = pageOffset;
      return snekfetch.get("https://www.deviantart.com/api/v1/oauth2/collections/" + config.discord.deviantart.folder, options1).then(function(response1)
      {
        let nextPage = response1.body;
        items = items.concat(nextPage.results);
        if(nextPage.next_offset) getPage(nextPage.next_offset);
        else callback(items, null);
      }).catch(function(error)
      {
        callback(null, error);
        console.log(error);
      });
    };
    getPage();
  }).catch(function(error)
  {
    callback(null, error);
    console.log(error);
  });
}

function getYTPlaylistItems(callback)
{
  let items = [];
  let getPage = function(pageToken)
  {
    let options =
    {
      query:
      {
        key: auth.youtube,
        part: "contentDetails",
        playlistId: config.discord.playlist,
        maxResults: 50
      }
    };
    if(pageToken) options.query.pageToken = pageToken;
    snekfetch.get("https://www.googleapis.com/youtube/v3/playlistItems", options).then(function(response)
    {
      let nextPage = response.body;
      items = items.concat(nextPage.items);
      if(nextPage.nextPageToken) getPage(nextPage.nextPageToken);
      else callback(items, null);
    }).catch(function(error)
    {
      callback(null, error);
      console.log(error);
    });
  };
  getPage();
}

function reverseObject(object)
{
	let length = 0;
	for(var a in object) length++;
	let reverse = [];
	for(var a = length - 1; a >= 0; a--) reverse.push(object[a]);
	return reverse;
}

/*
* Converts the given red, green and blue channels to a hex color string
*/
function rgbToHex(red, green, blue)
{
  return ((1 << 24) + (red << 16) + (green << 8) + blue).toString(16).slice(1);
}

/*
* Cuts off every second character of the given hex color string
*/
function hexToAP(hexColor)
{
	let apColor = "";
	for(let a = 0, b = hexColor.length; a < b; a = a + 2) apColor += hexColor[a];
	return apColor;
}

function apToHex(apColor)
{
	let hexColor = "";
	for(let a = 0, b = apColor.length; a < b; ++a) hexColor += apColor[a] + apColor[a];
	return hexColor;
}

function hexToRGB(hexColor)
{
  let rgb = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hexColor);
  return rgb ? [parseInt(rgb[1], 16), parseInt(rgb[2], 16), parseInt(rgb[3], 16), 255] : "";
}

function getDate()
{
  var today = new Date();
  return String(today.getDate()).padStart(2, "0") + "/" + String(today.getMonth() + 1).padStart(2, "0") + "/" + today.getFullYear();
}

function isURL(string)
{
  return string.startsWith("https://") || string.startsWith("http://");
}

function getRandomElement(array)
{
  return array[Math.floor(Math.random() * array.length)];
}
