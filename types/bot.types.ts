import { Bot } from 'mineflayer'
import {Pathfinder} from 'mineflayer-pathfinder'
export interface PathfinderBot extends Bot {
    pathfinder: Pathfinder;
 }