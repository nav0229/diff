const xmlBuilder = require('xmlbuilder');
const fs = require('fs-extra');
const mkdirp = require('mkdirp');

/**
 * Mapping of file name to Metadata Definition
 */
// @todo -- finish out all the different metadata types
const metaMap = {
	'applications': 'CustomApplication',
	'appMenus': 'AppMenu',
	'approvalProcesses': 'ApprovalProcess',
	'assignmentRules': 'AssignmentRules',
	'aura': 'AuraDefinitionBundle',
	'authproviders': 'AuthProvider',
	'autoResponseRules': 'AutoResponseRules',
	'classes': 'ApexClass',
	'communities': 'Community',
	'components': 'ApexComponent',
	'connectedApps': 'ConnectedApp',
	'customPermissions': 'CustomPermission',
	'customMetadata': 'CustomMetadata',
	'dashboards': 'Dashboard',
	'documents': 'Document',
	'email': 'EmailTemplate',
	'escalationRules': 'EscalationRules',
	'flowDefinitions': 'FlowDefinition',
	'flows': 'Flow',
	'groups': 'Group',
	'homePageComponents': 'HomePageComponent',
	'homePageLayouts': 'HomePageLayout',
	'installedPackages': 'InstalledPackage',
	'labels': 'CustomLabels',
	'layouts': 'Layout',
	'letterhead': 'Letterhead',
	'managedTopics': 'ManagedTopics',
	'matchingRules': 'MatchingRule',
	'namedCredentials': 'NamedCredential',
	'networks': 'Network',
	'objects': 'CustomObject',
	'objectTranslations': 'CustomObjectTranslation',
	'pages': 'ApexPage',
	'permissionsets': 'PermissionSet',
	'profiles': 'Profile',
	'queues': 'Queue',
	'quickActions': 'QuickAction',
	'remoteSiteSettings': 'RemoteSiteSetting',
	'reports': 'Report',
	'reportTypes': 'ReportType',
	'roles': 'Role',
	'staticresources': 'StaticResource',
	'triggers': 'ApexTrigger',
	'tabs': 'CustomTab',
	'sharingRules': 'SharingRules',
	'sharingSets': 'SharingSet',
	'siteDotComSites': 'SiteDotCom',
	'sites': 'CustomSite',
	'workflows': 'Workflow',
	'weblinks': 'CustomPageWebLink',
	'compactLayouts' : 'CompactLayout',
	'fields' : 'CustomField',
	'listViews' : 'ListView',
	'recordTypes' : 'RecordType',
	'validationRules' : 'ValidationRule',
	'webLinks' : 'WebLink',
	'globalValueSets' : 'GlobalValueSet',
	'sharingReasons' : 'SharingReason',
	'businessProcesses' : 'BusinessProcess',
	'fieldSets' : 'FieldSet',
	'lwc' : 'LightningComponentBundle',
};

exports.packageWriter = function(metadata, apiVersion) {
	apiVersion = apiVersion || '37.0';
	const xml = xmlBuilder.create('Package', { version: '1.0'});
	xml.att('xmlns', 'http://soap.sforce.com/2006/04/metadata');

	for (const type in metadata) {

		if (metadata.hasOwnProperty(type)) {
			const typeXml = xml.ele('types');
			metadata[type].forEach(function(item) {
				typeXml.ele('members', item);
			});

			typeXml.ele('name', metaMap[type]);
		}
	}
	xml.ele('version', apiVersion);

	return xml.end({pretty: true});
};

exports.buildPackageDir = function (dirName, name, metadata, packgeXML, destructive, cb) {

	let packageDir;
	let packageFileName;
	if (destructive) {
		packageDir = dirName + '/' + name + '/destructive';
		packageFileName = '/destructiveChanges.xml';
	} else {
		packageDir = dirName + '/' + name + '/unpackaged';
		packageFileName = '/package.xml';
	}

	// @todo -- should probably validate this a bit
	mkdirp(packageDir, (err) => {
		if(err) {
			return cb('Failed to write package directory ' + packageDir);
		}

		fs.writeFile(dirName + packageFileName, packgeXML, 'utf8', (err) => {
			if(err) {
				return cb('Failed to write xml file');
			}

			return cb(null, packageDir);
		});

	});
};

exports.copyFiles = function(sourceDir, buildDir, files) {
    sourceDir = sourceDir + '/';
    buildDir = buildDir + '/';

    files.forEach(function(file) {
        if(file) {
            fs.copySync(sourceDir + file, buildDir + file);

			//Grab other file if it exists
			let otherFile;
            if(file.endsWith('-meta.xml')) {
				otherFile = file.replace('-meta.xml', '');
			} else {
				otherFile = file + '-meta.xml';
			}
			let otherExists = true;
			try {
				fs.accessSync(sourceDir + otherFile, fs.F_OK);
			}
			catch (err) {
				otherExists = false;
			}

			if(otherExists) {
				fs.copySync(sourceDir + otherFile, buildDir + otherFile);
			}
        }
    });
};

exports.copyAuraBundles = function(sourceDir, buildDir, files) {
    sourceDir = sourceDir + '/';
    buildDir = buildDir + '/';

    files.forEach(function(file) {
        if(file) {
            fs.copySync(sourceDir + file, buildDir + file);
        }
    });
};

exports.copyStaticResources = function(sourceDir, buildDir, files) {
    sourceDir = sourceDir + '/';
    buildDir = buildDir + '/';

    files.forEach(function(file) {
        if(file) {
			fs.copySync(sourceDir + file, buildDir + file);
			if(!file.endsWith('.resource-meta.xml')) {
				//Grab other file if it exists
				let otherFile;
				if(file.endsWith('.css')) {
					otherFile = file.replace('.css', '.resource-meta.xml');
				} else if(file.endsWith('.xlsx')) {
					otherFile = file.replace('.xlsx', '.resource-meta.xml');
				} else if(file.endsWith('.pdf')) {
					otherFile = file.replace('.pdf', '.resource-meta.xml');
				} else if(file.endsWith('.png')) {
					otherFile = file.replace('.png', '.resource-meta.xml');
				} else {
					otherFile = file + '.resource-meta.xml';;
				}
				let otherExists = true;
				try {
					fs.accessSync(sourceDir + otherFile, fs.F_OK);
				}
				catch (err) {
					otherExists = false;
				}

				if(otherExists) {
					fs.copySync(sourceDir + otherFile, buildDir + otherFile);
				}
			}
        }
    });
};