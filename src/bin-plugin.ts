#!/usr/bin/env node

import './utils/global-state';

import * as colors from 'colors';
import * as commander from 'commander';
import * as _ from 'lodash';
import * as updateNotifier from 'update-notifier';

import * as pkg from '../package.json';

import * as semver from 'semver';
import { log } from './utils/log';
import { loadPlugins, plugin } from './utils/plugins';
import text from './utils/text';

import commandBuild from './pri-plugin-commanders/build';
import commandInit from './pri-plugin-commanders/init';
import commandTest from './pri-plugin-commanders/test';
import commandWatch from './pri-plugin-commanders/watch';

commander.version(pkg.version, '-v, --version');

commander
  .command(`init`)
  .description('Init plugin project')
  .action(async () => {
    await commandInit();
  });

commander
  .command(`watch`)
  .description('Watch plugin files')
  .action(async () => {
    await commandWatch();
  });

commander
  .command(`build`)
  .description('Bundle plugin')
  .action(async () => {
    await commandBuild();
  });

commander
  .command(`test`)
  .description('Run test')
  .action(async () => {
    await commandTest();
    process.exit(0);
  });

/**
 * Parse argv.
 */
commander.parse(process.argv);

updateNotifier({ pkg }).notify();
