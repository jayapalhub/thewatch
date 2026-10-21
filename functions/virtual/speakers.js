import { VIRTUAL } from "../_lib/constants.js";
import { speakersPage } from "../_lib/speakers-page.js";

export async function onRequestGet({ env }) { return speakersPage(env, VIRTUAL); }
