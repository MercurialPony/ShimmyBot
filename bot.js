"use strict";

// TODO Errors
// TODO User agent header
// TOPO Alpha pixels
// TODO Warn about overlapping thingies
// TODO Remove all guild stuff if removed from guild
// TODO Handle DMs
// TODO Fix weird ass colors like white, black orange etc
// TODO Clean up and organize
// TODO Flavor
// TODO Alert about network issues
// TODO for loops decide
// TODO Careful with types
// TODO Functions to lambdas
// TODO Remove ping on reply?
// TODO Add random emojis
// TODO Bot is playing [whatever]
// TODO Funcs return text
// TODO Don't write to file when unnecessary
// TODO Reply to h
// TODO Permissions
// TODO Random responses and copypastas
// TODO Consistent ``
// TODO Greeting in welcome channel
// TODO Test <@ and <@&

// Deps
const Discord = require("discord.js");
const snekfetch = require("snekfetch");
const bzip2 = require("./bzip2");
const fs = require("fs");
const PNG = require("pngjs").PNG;
const Readable = require("stream").Readable;

// Another place
const updateInterval = 2000;
const timeout = 30000;

let loadedPixels;
let lastID = 0;
let size = 0;
let reading = false;
let lastRead = 0;

// Discord
const client = new Discord.Client();

const defaultSettings = createDefaultSettings();

const commandsByName = new Map([
  [ "help", function(message, args)
  {
    message.reply("You *really* want to know more about ***me***? How flattering~! I've sent you all you need to know *privately*~ ~~Call me sometime~~");
    message.author.send("help yes");
  }],
  [ "snapshot", function(message, args)
  {
    message.reply(args && args.length > 0 ? "Here's yo-- wait.. " + args.join(" ") + "? **What**-? *I-I'll* just leave this here.." : "*Snap*", new Discord.Attachment(composePNG(loadedPixels).pack()));
  }],
  [ "region", function(message, args)
  {
    executeCommand(regionCommandsByName, message, args[0], args.splice(1));
  }],
  [ "settings", function(message, args)
  {
    if(args && args.length > 0) executeCommand(settingsCommandsByName, message, args[0], args.splice(1));
    else
    {
      let settings = getOrDefaultSettings(message.guild.id);
      message.reply("Alright lemme just... Aha, this should be the list of *everything* I need to remember about this server. Nearly lost it *shudders* ```autohotkey" + '\nprefix: "' + settings.prefix + '"\ninput: "' + settings.input.map(id => "#" + client.channels.get(String(id)).name).join('", "') + '"\noutput: "' + settings.output.map(id => "#" + client.channels.get(String(id)).name).join('", "') + '"\nrecipients: "' + settings.recipients.map(id => "@" + message.guild.roles.get(String(id)).name).join('", "') + '"\nmoderators: "' + settings.moderators.map(id => "#" + message.guild.roles.get(String(id)).name).join('", "') + '"\n```');
    }
  }]
]);

const regionCommandsByName = new Map([
  [ "add", function(message, args)
  {
    if(!args || args.length < 4) message.reply("Why did you just stop mid-sentence? Keep going, I need to know more!~ This is exciting!^^");
    else if(args.length > 4) message.reply();
    else
    {
      let regions = getOrDefaultRegions(message.guild.id);
      if(args[0] in regions) message.reply("Come on now, you *know* two pieces of art can't have the same name^^");
      else if(!isURL(args[1])) message.reply("I'm pretty sure that `" + args[1] + "` isn't a url or link of any kind..");
      else if(isNaN(args[2])) message.reply("Haha, `" + args[2] + "` isn't a number, silly!");
      else if(isNaN(args[3])) message.reply("Haha, `" + args[3] + "` isn't a number, silly!");
      else loadPNG(args[1], function(pixels, error)
      {
        if(error) message.reply("So I tried looking over that image and, well, *uuh*, I think there's something wrong with it. *Whispering* I think it may not *even* ***be*** an image at all!");
        else
        {
          message.reply("*Gasp* Wow, that's.. that's my new favorite pixel fanart! I'm adding it to my collection as we speak!*");
          regions[args[0]] =
          {
            image: args[1],
            x: args[2],
            y: args[3],
            pixels: pixels
          }
          writeRegions();
        }
      });
    }
  }],
  [ "remove", function(message, args)
  {
    if(!args || args.length === 0) message.reply("I think you forgot to mention what you'd like removed^^");
    else
    {
      let regions = getOrDefaultRegions(message.guild.id);
      let accepted = [];
      let rejected = [];
      for(let a = 0; a < args.length; ++a)
      {
        if(args[a] in regions)
        {
          delete regions[args[a]];
          accepted.push(args[a]);
        }
        else rejected.push(args[a]);
      }
      message.reply((accepted.length > 0 ? "I'll miss watching over `" + accepted.join("`, `") + "`, " + (accepted.length === 1 ? "it really wasn't" : "they really weren't") + " *so* bad.. " : "") + (rejected.length > 0 ? "I don't remember anyone asking me to look after `" + rejected.join("`, `") + "`" + (accepted.length > 0 ? " though" : "") : ""));
      if(accepted.length > 0) writeRegions();
    }
  }],
  [ "clear", function(message, args)
  {
    let names = Object.keys(getOrDefaultRegions(message.guild.id));
    message.reply((args && args.length > 0 ? '"' + args.join(" ") + '" -- ' + message.author.username + " -- " + getDate() + ". Haha just kidding~^^ " : "") + (names.length > 0 ? "W-wait, a-all of them-? But some of them were my favorites like `" + names[Math.floor(Math.random() * names.length)] + "` for example.." : "There're none ***to*** remove. We need more art on the canvas, I'm telling you!"));
    regionsByGuild[message.guild.id] = {};
    writeRegions();
  }],
  [ "list", function(message, args)
  {
    let names = Object.keys(getOrDefaultRegions(message.guild.id));
    message.reply((args && args.length > 0 ? args.join(" ") + " what now-? I'm guessing you wanna see the art list. " : "") + (names.length > 0 ? "Yeah, these gorgeous pieces are under ***my*** *strict supervision*!*" + "```css\n" + names.join("\n") + "```" : "No art to watch just yet.. We *really* need to add some right now! Trust me, it'll be fun!^^"));
  }],
  [ "info", function(message, args)
  {
    let regions = getOrDefaultRegions(message.guild.id);
    let names = Object.keys(regions);
    message.reply(!args || args.length === 0 ? "Which one are you thinking of exactly?^^" : (args.length > 1 ? "Wow, that's a *lot* you want to hear about at once! Would you mind asking for about " + (args.length - 1) + " less images~?" : (args[0] in regions ? "Isn't this one just *so* beautiful? I *absolutely* ***love*** it-!* ```autohotkey" + '\nimage: "' + regions[args[0]].image + '"\nx: ' + regions[args[0]].x + "\ny: " + regions[args[0]].y + "\n```" : "I-I can't find anything called `" + args[0] + "`.. I'm looking, I'm looking-!" + (names.length > 0 ? " Why don't you try `" + names[Math.floor(Math.random() * names.length)] + "` though? It's one of my favorites!" : ""))));
  }]
]);

// TODO Shorten and clean up
const settingsCommandsByName = new Map([
  [ "prefix", function(message, args)
  {
    let settings = getOrDefaultSettings(message.guild.id);
    if(!args || args.length === 0) message.reply(settings.prefix ? "I'm on the lookout for any of those `" + settings.prefix + "` messages*" : "I'm attentively waiting for you to call my name out^^");
    else if(args.length > 1) message.reply("Oh my~ so *many* options, so **many** choices! How about you try again and offer me " + (args.length - 1) + " less options to choose from?");
    else
    {
      if(args[0] === "clear")
      {
        message.reply("Well well.. you'll have to adress me directly now if you want something*");
        settings.prefix = "";
      }
      else
      {
        message.reply("I will be paying.. *very close* attention to every one of your messages that starts with `" + args[0] + "` from this moment on~");
        settings.prefix = args[0];
      }
      writeSettings();
    }
  }],
  [ "input", function(message, args)
  {
    let settings = getOrDefaultSettings(message.guild.id);
    if(!args || args.length === 0) message.reply(settings.input.length > 0 ? "I'm listening to you with utmost attention in <#" + settings.input.join(">, <#") + ">" : "I'm free to snoop on all your conversations~!");
    else if(args.length === 1 && args[0] === "clear")
    {
      if(settings.input && settings.input.length > 0)
      {
        message.reply("I can now listen to you from anywhere-!");
        settings.input = [];
        writeSettings();
      }
      else message.reply("I can ***still*** eavesdrop on you~ hehe");
    }
    else
    {
      let accepted = [];
      let rejected = [];
      for(let a = 0; a < args.length; ++a)
      {
        let id = args[a];
        if(id.startsWith("<#") && id.endsWith(">")) id = id.slice(2, -1);
        if(message.guild.channels.has(id)) accepted.push(id);
        else rejected.push(args[a]);
      }
      message.reply((accepted.length > 0 ? "I will be listening extra intently for you in <#" + accepted.join(">, <#") + "> from now on~ " : "") + (rejected.length > 0 ? "I looked extra hard, promise, but " + rejected.join(", ") + (rejected.length === 1 ? " is" : " are") + " nowhere to be found" + (accepted.length > 0 ? " though" : "") : ""));
      if(accepted.length === 0) return;
      settings.input = accepted;
      writeSettings();
    }
  }],
  [ "output", function(message, args)
  {
    let settings = getOrDefaultSettings(message.guild.id);
    if(!args || args.length === 0) message.reply(settings.output.length > 0 ? "I've been told to report anything that looks dangerous in <#" + settings.output.join(">, <#") + ">" : "I have nowhere to alert anyone anymore..");
    else if(args.length === 1 && args[0] === "clear")
    {
      if(settings.output && settings.output.length > 0)
      {
        settings.output = [];
        message.reply("B-but where will I alert everyone now-?");
        writeSettings();
      }
      else message.reply("There's nowhere for me to alert anyone in case of an attack-.. Will you allow me to do that somewhere?~");
    }
    else
    {
      let accepted = [];
      let rejected = [];
      for(let a = 0; a < args.length; ++a)
      {
        let id = args[a];
        if(id.startsWith("<#") && id.endsWith(">")) id = id.slice(2, -1);
        if(message.guild.channels.has(id)) accepted.push(id);
        else rejected.push(args[a]);
      }
      message.reply((accepted.length > 0 ? "I will alert <#" + accepted.join(">, <#") + "> in case of an emergency starting right about now! " : "") + (rejected.length > 0 ? "I can't find " + rejected.join(", ") + " anywhere around here" + (accepted.length > 0 ? " though" : "") : ""));
      if(accepted.length === 0) return;
      settings.output = accepted;
      writeSettings();
    }
  }],
  [ "recipients", function(message, args)
  {
    let settings = getOrDefaultSettings(message.guild.id);
    if(!args || args.length === 0) message.reply(settings.recipients.length > 0 ? "I'm reporting anything *dangerous* or ***nasty*** to <@&" + settings.recipients.join(">, <@&") + ">" : (settings.output.length > 0 ? "Oh I'm currently reporting trouble to <#" + settings.output.join(">, <#") + ">, but no one *in particular*^^" : "Well I've been told to report nothing for now (*whispering* and hopefully not for very long)"));
    else if(args.length === 1 && args[0] === "clear")
    {
      if(settings.recipients && settings.recipients.length > 0)
      {
        message.reply("I guess I won't alert anyone *specifically* then-~");
        settings.recipients = [];
        writeSettings();
      }
      else message.reply("Oh, but I already don't have anyone to warn *for now*");
    }
    else
    {
      let accepted = [];
      let rejected = [];
      for(let a = 0; a < args.length; ++a)
      {
        let id = args[a];
        if(id.startsWith("<@&") && id.endsWith(">")) id = id.slice(3, -1);
        if(message.guild.roles.has(id)) accepted.push(id);
        else rejected.push(args[a]);
      }
      message.reply((accepted.length > 0 ? "I'll make sure to alert <@&" + accepted.join(">, <@&") + "> now if something goes wrong, I promise! " : "") + (rejected.length > 0 ? "Are you sure that " + rejected.join(", ") + " are in their natural habitat here*? Because I sure can't see any around-.." : ""));
      if(accepted.length === 0) return;
      settings.recipients = accepted;
      writeSettings();
    }
  }],
  [ "moderators", function(message, args)
  {
    let settings = getOrDefaultSettings(message.guild.id);
    if(!args || args.length === 0) message.reply(settings.output.length > 0 ? "I've been told to report anything that looks dangerous in <#" + settings.output.join(">, <#") + ">" : "I have nowhere to alert anyone anymore..");
    else if(args.length === 1 && args[0] === "clear")
    {
      if(settings.moderators && settings.moderators.length > 0)
      {
        message.reply("B-but where will I alert everyone now-?");
        settings.moderators = [];
        writeSettings();
      }
      else message.reply();
    }
    else
    {
      let accepted = [];
      let rejected = [];
      for(let a = 0; a < args.length; ++a)
      {
        let id = args[a];
        if(id.startsWith("<@&") && id.endsWith(">")) id = id.slice(3, -1);
        if(message.guild.roles.has(id)) accepted.push(id);
        else rejected.push(args[a]);
      }
      message.reply((accepted.length > 0 ? "I will alert <#" + accepted.join(">, <#") + "> in case of an emergency starting right about now! " : "") + (rejected.length > 0 ? "I can't find " + rejected.join(", ") + " anywhere around here" + (accepted.length > 0 ? " though" : "") : ""));
      if(accepted.length === 0) return;
      settings.moderators = accepted;
      writeSettings();
    }
  }]
]);

function createDefaultSettings()
{
  let settings =
  {
    prefix: "",
    input: [],
    output: [],
    recipients: [],
    moderators: []
  };
  return settings;
}

let regionsByGuild = {}
let settingsByGuild = {}

function writeRegions()
{
  let stream = new Readable();
  stream.push(JSON.stringify(regionsByGuild, function(key, value)
  {
    if(key === "pixels") return undefined;
    else return value;
  }, 2));
  stream.push(null);
  stream.pipe(fs.createWriteStream("./data/regions.json"));
}

function writeSettings()
{
  let stream = new Readable();
  stream.push(JSON.stringify(settingsByGuild, null, 2));
  stream.push(null);
  stream.pipe(fs.createWriteStream("./data/settings.json"));
}

client.on("ready", function()
{
  console.log("Logged in as " + client.user.tag);
});

// TODO Clean up and refractor
client.on("message", function(message)
{
  let settings = getSettings(message.guild.id);
  if(settings.input && settings.input.length > 0 && !settings.input.includes(message.channel.id)) return;
  if(settings.prefix && message.content.startsWith(settings.prefix))
  {
    let args = message.content.split(" ");
    executeCommand(commandsByName, message, args[0].substring(settings.prefix.length), args.splice(1));
  }
  else if(message.content.startsWith("<@&" + client.user.id + ">"))
  {
    let args = message.content.split(" ");
    executeCommand(commandsByName, message, args[1], args.splice(2));
  }
});

function executeCommand(commands, message, command, args)
{
  let settings = getSettings(message.guild.id);
  if(commands.has(command)) commands.get(command)(message, args);
  else message.reply((command ? "Well, um, I'm not sure what you mean by `" + command + "` exactly. " : "You didn't finish your sentence.. Carry on~ ") + getHelpMessage(message.guild.id));
}

function getOrDefaultRegions(id)
{
  if(!(id in regionsByGuild)) regionsByGuild[id] = {};
  return regionsByGuild[id];
}

function getOrDefaultSettings(id)
{
  if(!(id in settingsByGuild)) settingsByGuild[id] = createDefaultSettings();
  return settingsByGuild[id];
}

function getHelpMessage(id)
{
  let settings = getSettings(id);
  return "Type <@&" + client.user.id + "> `help`" + (settings.prefix ? " or `" + settings.prefix + "help`" : "") + " if you're stuck or want to learn more about me mhm";
}

function getSettings(id)
{
  return id in settingsByGuild ? settingsByGuild[id] : defaultSettings;
}

client.login("NTk3MDI3MTcyOTgwNjIxMzE0.XSCHvA.sQbaY9tVaUekbl_KyOA_tUnNZfs");

snekfetch.get("http://origami64.net/inc/plugins/place/place_fast.bin").then(function(response)
{
  let data = bzip2.simple(bzip2.array(new Uint8Array(response.body))).split("/");
  lastID = +data[0];
  size = +data[1];
  // Initializes a 2d array of colors filled with undefined values with some headroom for expansion
  loadedPixels = [...Array(+size + +100)].map(element => Array(+size + +100));
  for (let a = 2; a < data.length; ++a)
  {
    let color = data[a];
    if(!color) continue;
    loadedPixels[+(((a - 2) % size))][+(Math.floor((a - 2) / size))] = color;
  }
  console.log("Read canvas of size " + size);
  setInterval(function()
  {
    if(!reading || (+new Date().getTime() - +lastRead) >= timeout) readPixels();
  }, updateInterval);
}).catch(function(error)
{
  console.log(error);
});

fs.readFile("./data/regions.json", "utf-8", function(error, data)
{
  if(!data) return;
  regionsByGuild = JSON.parse(data);
  for(let a in regionsByGuild) for(let b in regionsByGuild[a]) loadPNG(regionsByGuild[a][b].image, function(pixels, error)
  {
    regionsByGuild[a][b].pixels = pixels;
  });
});

fs.readFile("./data/settings.json", "utf-8", function(error, data)
{
  if(!data) return;
  settingsByGuild = JSON.parse(data);
});

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
  for(let y = 0; y < pixels[0].length; ++y) for(let x = 0; x < pixels.length; ++x)
  {
    let color = pixels[x][y];
    if(color) color = hexToRGB(apToHex(color));
    if(!color) color = [255, 255, 255];
    png.data[index] = color[0];
    png.data[index + 1] = color[1];
    png.data[index + 2] = color[2];
    png.data[index + 3] = 255;
    index += 4;
  }
  return png;
}

function addPixel(id, color, x, y)
{
  loadedPixels[x][y] = color;
  if(id > lastID) lastID = id;
  for(let a in regionsByGuild)
  {
    let endangeredRegions = "";
    for(let b in regionsByGuild[a]) if(intersects(+regionsByGuild[a][b].x, +regionsByGuild[a][b].y, +regionsByGuild[a][b].pixels.length, +regionsByGuild[a][b].pixels[0].length, +x, +y, 1, 1) && color !== regionsByGuild[a][b].pixels[+x - +regionsByGuild[a][b].x][+y - +regionsByGuild[a][b].y]) endangeredRegions += "`" + b + "`, ";
    if(!endangeredRegions) continue;
    let settings = getSettings(a);
    for(let c = 0; c < settings.output.length; ++c) client.channels.get(String(settings.output[c])).send("Our *precious masterpieces* " + endangeredRegions.slice(0, -2) + " are *under* ***attack*** at (" + x + ", " + y + ")! Somebody.. Do someTHING!! -please!");
  }
}

// Rect 1 contains rect2
function intersects(x1, y1, width1, height1, x2, y2, width2, height2)
{
  return x1 <= x2 && y1 <= y2 && x1 + width1 >= x2 + width2 && y1 + height1 >= y2 + height2;
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
      "Origin": "http://origami64.net"
    }
  };
  let req = snekfetch.post("http://origami64.net/place.php", options).then(function(response)
  {
    let receivedPixels = reverseObject(eval(response.text.substring(2)));
    for(let a in receivedPixels)
    {
      let pixel = receivedPixels[a];
      addPixel(pixel[0], pixel[1].substring(1), pixel[2], pixel[3]);
    }
    reading = false;
  }).catch(function(error)
  {
    console.log(error);
  });
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
	for(let a = 0; a < hexColor.length; a = a + 2) apColor += hexColor[a];
	return apColor;
}

function apToHex(apColor)
{
	let hexColor = "";
	for(let a = 0; a < apColor.length; ++a) hexColor += apColor[a] + apColor[a];
	return hexColor;
}

function hexToRGB(hexColor)
{
  let rgb = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hexColor);
  return rgb ? [parseInt(rgb[1], 16), parseInt(rgb[2], 16), parseInt(rgb[3], 16)] : null;
}

function getDate()
{
  var today = new Date();
  return String(today.getDate()).padStart(2, '0') + "/" + String(today.getMonth() + 1).padStart(2, "0") + "/" + today.getFullYear();
}

function isURL(string)
{
  return string.startsWith("https://") || string.startsWith("http://");
}
