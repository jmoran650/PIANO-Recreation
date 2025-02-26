// index.ts
import { Bot } from "mineflayer"
import { mineflayer as mineflayerViewer } from "prismarine-viewer"
import { goals as pfGoals } from "mineflayer-pathfinder" // Renamed import for clarity.
import minecraftData from "minecraft-data"

import { createAgentBot, AgentBot } from "./createAgentBot"

// Export main so it can be called from server.ts
export async function main(): Promise<AgentBot> {
  try {
    const agent: AgentBot = await createAgentBot({
      host: "localhost",
      port: 37269,
      username: "AgentBot",
      version: "1.21.4"
    })

    const { bot, observer, navigation, actions } = agent

    bot.on("chat", async (username: string, message: string) => {
      if (username === bot.username) return

      // Some existing sample chat commands:
      if (message === "blocks") {
        const visibleBlocksResult = await observer.getVisibleBlockTypes()
        const blocksStr = Object.entries(visibleBlocksResult.BlockTypes)
          .map(([blockName, { x, y, z }]) => `${blockName} at (${x}, ${y}, ${z})`)
          .join(", ")
        bot.chat(`Visible Blocks: ${blocksStr || "None"}`)
      } else if (message === "mobs") {
        const visibleMobsResult = await observer.getVisibleMobs()
        const mobsStr = visibleMobsResult.Mobs
          .map((mob) => `${mob.name} (${mob.distance} away)`)
          .join(", ")
        bot.chat(`Visible Mobs: ${mobsStr || "None"}`)
      } else if (message === "home") {
        bot.chat("/tp -124 62 28")
      } else if (message === "tome") {
        bot.chat("/tp jibbum")
      } else if (message === "wood") {
        const visibleBlocksResult = await observer.getVisibleBlockTypes()
        const blockTypes = visibleBlocksResult.BlockTypes
        const woodCandidates = Object.keys(blockTypes).filter(
          (name) => name.includes("log") || name.includes("wood") || name.includes("plank")
        )
        if (woodCandidates.length === 0) {
          bot.chat("No trees nearby")
          return
        }
        const woodName = woodCandidates[0]
        const { x, y, z } = blockTypes[woodName]
        bot.chat(`Moving to the nearest wood block: ${woodName} at (${x}, ${y}, ${z})`)
        await navigation.move(x, y, z)
        bot.chat("Arrived at the wood block!")
      } else if (message === "move") {
        const { x, y, z } = bot.entity.position
        const targetX = Math.floor(x + 10)
        const targetY = Math.floor(y)
        const targetZ = Math.floor(z)
        bot.chat(`Moving 10 blocks away to (${targetX}, ${targetY}, ${targetZ})...`)
        await navigation.move(targetX, targetY, targetZ)
        bot.chat("Arrived at new location!")
      }

      // New test commands:
      else if (message.startsWith("test ")) {
        const parts = message.split(" ")
        const subcommand = parts[1]

        switch (subcommand) {
          case "recipe": {
            // Usage: "test recipe <itemName>"
            const itemName = parts.slice(2).join("_")
            if (!itemName) {
              bot.chat("Usage: test recipe <itemName>")
              return
            }
            const recipeInfo = observer.getRecipeForItem(itemName)
            bot.chat(recipeInfo)
            break
          }

          case "craftable": {
            // Usage: "test craftable <itemName>"
            const itemName = parts.slice(2).join("_")
            if (!itemName) {
              bot.chat("Usage: test craftable <itemName>")
              return
            }
            const canCraft = observer.canCraftItem(itemName)
            bot.chat(
              canCraft
                ? `Yes, I can craft "${itemName}" immediately from my current inventory.`
                : `No, I cannot craft "${itemName}" immediately.`
            )
            break
          }

          case "possible": {
            // Usage: "test possible <itemName>"
            const itemName = parts.slice(2).join("_")
            if (!itemName) {
              bot.chat("Usage: test possible <itemName>")
              return
            }
            const canEventually = observer.canEventuallyCraftItem(itemName)
            bot.chat(
              canEventually
                ? `Yes, it is possible to craft "${itemName}" with sub-crafting.`
                : `No, it is not possible to craft "${itemName}" (even with sub-crafting).`
            )
            break
          }

          case "mine": {
            const blockName = parts[2]
            const desiredCount = parseInt(parts[3] || "1", 10)
            if (!blockName) {
              bot.chat("Usage: test mine <blockName> [count]")
              return
            }
            await actions.mine(blockName, desiredCount)
            break
          }

          case "craft": {
            const itemName = parts[2]
            if (!itemName) {
              bot.chat("Usage: test craft <itemName>")
              return
            }
            await actions.craft(itemName)
            break
          }

          case "place": {
            const blockType = parts[2]
            if (!blockType) {
              bot.chat("Usage: test place <blockType>")
              return
            }
            await actions.place(blockType)
            break
          }

          case "attack": {
            const mobType = parts[2]
            if (!mobType) {
              bot.chat("Usage: test attack <mobType>")
              return
            }
            await actions.attack(mobType)
            break
          }

          case "safetable": {
            await actions.placeCraftingTable()
            break
          }

          case "usetable": {
            await actions.useCraftingTable()
            break
          }

          case "inv": {
            const contents = observer.getInventoryContents()
            if (contents.length === 0) {
              bot.chat("My inventory is empty.")
            } else {
              bot.chat("My inventory (slot by slot): " + contents.join(", "))
            }
            break
          }

          default:
            bot.chat(
              "Unknown test command. Valid subcommands include: " +
                "recipe, craftable, possible, mine, craft, place, attack, safetable, usetable, inv"
            )
        }
      }
    })

    bot.on("error", (err) => {
      console.error("Bot error:", err)
    })

    // Return the entire AgentBot (including sharedState) for external use
    return agent
  } catch (err) {
    console.error("Failed to create AgentBot:", err)
    throw err
  }
}