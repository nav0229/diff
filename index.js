#!/usr/bin/env node

/**
 * CLI tool to parse git diff and build a package.xml file from it.
 * This is useful for using the MavensMate deployment tool and selecting the existing package.xml file
 * Also used in larger orgs to avoid deploying all metadata in automated deployments
 *
 * usage:
 *  $ sfpackage master featureBranch ./deploy/
 *
 *  This will create a file at ./deploy/featureBranch/unpackaged/package.xml
 *  and copy each metadata item into a matching folder.
 *  Also if any deletes occurred it will create a file at ./deploy/featureBranch/destructive/destructiveChanges.xml
 */
const program = require('commander');
const spawnSync = require('child_process').spawnSync;
const packageWriter = require('./lib/metaUtils').packageWriter;
const buildPackageDir = require('./lib/metaUtils').buildPackageDir;
const copyFiles = require('./lib/metaUtils').copyFiles;
const copyAuraBundles = require('./lib/metaUtils').copyAuraBundles;
const copyStaticResources = require('./lib/metaUtils').copyStaticResources;
const packageVersion = require('./package.json').version;

program
    .arguments('<compare> <branch> [target]')
    .version(packageVersion)
    .option('-d, --dryrun', 'Only print the package.xml and destructiveChanges.xml that would be generated')
    .option('-p, --pversion [version]', 'Salesforce version of the package.xml', parseInt)
    .action(function (compare, branch, target) {

        if (!branch || !compare) {
            console.error('branch and target branch are both required');
            program.help();
            process.exit(1);
        }

        const dryrun = program.dryrun;

        if (!dryrun && !target) {
            console.error('target required when not dry-run');
            program.help();
            process.exit(1);
        }

        const currentDir = process.cwd();
        const gitDiff = spawnSync('git', ['--no-pager', 'diff', '--name-status', compare, branch]);
        const gitDiffStdOut = gitDiff.stdout.toString();
        const gitDiffStdErr = gitDiff.stderr.toString();

        if (gitDiffStdErr) {
            console.error('An error has occurred: %s', gitDiffStdErr);
            process.exit(1);
        }

        let fileListForCopy = [];
        let auraBundlesForCopy = [];
        let staticResourcesForCopy = [];

        //defines the different member types
        const metaBag = {};
        const metaBagDestructive = {};
        let deletesHaveOccurred = false;

        const fileList = gitDiffStdOut.split('\n');
        fileList.forEach(function (fileName) {

            // get the git operation
            const operation = fileName.slice(0,1);
            // remove the operation and spaces from fileName
            if(operation === 'R') {
                fileName = fileName.split('\t')[2];
            } else {
                fileName = fileName.split('\t')[1];
            }

            //ensure file is inside of force-app directory of project
            if (fileName && fileName.substring(0,9) === 'force-app') {
                const parts = fileName.split('/');
                // Check for invalid fileName, likely due to data stream exceeding buffer size resulting in incomplete string
                // TODO: need a way to ensure that full fileNames are processed - increase buffer size??
                if (parts[2] === undefined) {
                    console.error('File name "%s" cannot be processed, exiting', fileName);
                    process.exit(1);
                }

                let meta;
                let type = parts[3];

                if(type === 'aura' || type === 'lwc' || (type === 'staticresources' && parts.length !== 4)) {
                    meta = parts[4];
                } else if(type === 'customMetadata') {
                    // Processing custommetadata Records. Strip md-meta.xml from the end.
                    meta = parts[4].replace('.md-meta.xml', '');
                } else if(type === 'objects') {
                    // Processing object Records and sub-Records.
                    if(parts.length === 6) {
                        meta = parts[5].split('.')[0];
                    } else {
                        type = parts[5];
                        meta = parts[4] + '.' + parts[6].split('.')[0];
                    }
                } else if(parts.length === 6) {
                    // Processing metadata with nested folders e.g. emails, documents, reports
                    meta = parts[4] + '/' + parts[5].split('.')[0];
                } else {
                    // Processing metadata without nested folders.
                    meta = parts[4].split('.')[0];
                }

                if((type === 'aura' || type === 'lwc') && (operation === 'A' || operation === 'M' || operation === 'R')) {
                    console.log('Part of Aura Bundle was added or modified: %s', fileName);
                    let auraBundle = parts[0] + '/' + parts[1] + '/' + parts[2] + '/' + parts[3] + '/' + parts[4];
                    if(!auraBundlesForCopy.includes(auraBundle)) {
                        auraBundlesForCopy.push(auraBundle);
                    }

                    if (!metaBag.hasOwnProperty(type)) {
                        metaBag[type] = [];
                    }
                    if (metaBag[type].indexOf(meta) === -1) {
                        metaBag[type].push(meta);
                    }
                    
                } else if(type === 'staticresources' && parts.length !== 4 && (operation === 'A' || operation === 'M' || operation === 'R')) {
                    console.log('Part of Static Resource was added or modified: %s', fileName);
                    let staticResource = parts[0] + '/' + parts[1] + '/' + parts[2] + '/' + parts[3] + '/' + parts[4];
                    if(!staticResourcesForCopy.includes(staticResource)) {
                        staticResourcesForCopy.push(staticResource);
                    }

                    if (!metaBag.hasOwnProperty(type)) {
                        metaBag[type] = [];
                    }
                    if (metaBag[type].indexOf(meta) === -1) {
                        metaBag[type].push(meta);
                    }
                } else if ((type === 'aura' || type === 'lwc' || (type === 'staticresources' && parts.length !== 4)) && operation === 'D') {
                    console.log('Part of Aura Bundle was deleted: %s', fileName);
                    console.log('Aura Bundle deletion ignored');
                } else if (operation === 'A' || operation === 'M' || operation === 'R') {
                    // file was added or modified - add fileName to array for unpackaged and to be copied
                    console.log('File was added or modified: %s', fileName);
                    fileListForCopy.push(fileName);

                    if (!metaBag.hasOwnProperty(type)) {
                        metaBag[type] = [];
                    }

                    if (metaBag[type].indexOf(meta) === -1) {
                        metaBag[type].push(meta);
                    }
                } else if (operation === 'D') {
                    // file was deleted
                    console.log('File was deleted: %s', fileName);
                    deletesHaveOccurred = true;

                    if (!metaBagDestructive.hasOwnProperty(type)) {
                        metaBagDestructive[type] = [];
                    }

                    if (metaBagDestructive[type].indexOf(meta) === -1) {
                        metaBagDestructive[type].push(meta);
                    }
                } else {
                    // situation that requires review
                    return console.error('Operation on file needs review: %s', fileName);
                }
            }
        });

        // build package file content
        const packageXML = packageWriter(metaBag, program.pversion);
        // build destructiveChanges file content
        const destructiveXML = packageWriter(metaBagDestructive, program.pversion);
        if (dryrun) {
            console.log('\npackage.xml\n');
            console.log(packageXML);
            console.log('\ndestructiveChanges.xml\n');
            console.log(destructiveXML);
            process.exit(0);
        }

        console.log('Building in directory %s', target);

        buildPackageDir(target, branch, metaBag, packageXML, false, (err, buildDir) => {
            if (err) {
                return console.error(err);
            }

            copyFiles(currentDir, buildDir, fileListForCopy);
            copyAuraBundles(currentDir, buildDir, auraBundlesForCopy)
            copyStaticResources(currentDir, buildDir, staticResourcesForCopy)
            console.log('Successfully created package.xml and files in %s',buildDir);
        });

        if (deletesHaveOccurred) {
            buildPackageDir(target, branch, metaBagDestructive, destructiveXML, true, (err, buildDir) => {

                if (err) {
                    return console.error(err);
                }

                console.log('Successfully created destructiveChanges.xml in %s',buildDir);
            });
        }
    });

program.parse(process.argv);
