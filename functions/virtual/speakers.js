import { VIRTUAL } from "../_lib/constants.js";
import { speakersPage } from "../_lib/speakers-page.js";

export async function onRequestGet({ env, request, waitUntil }) { return speakersPage(env, VIRTUAL, request, waitUntil); }
