import * as core from '@actions/core';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
    try {
        const configFile = core.getInput('config-file', { required: true });
        let outFile = core.getInput('out-file', { required: false });
        const fileType = core.getInput('file-type', { required: true });
        const environmentVariablesString = core.getInput('environment-variables', { required: true });

        if (!outFile?.length) {
            core.info(`out-file input not provided. Will write values back to config-file '${ configFile }'`);
            outFile = configFile;
        }

        const configFilePath = path.isAbsolute(configFile) ?
                               configFile :
                               path.join(process.env.GITHUB_WORKSPACE!, configFile);
        const outFilePath = path.isAbsolute(outFile) ?
                            outFile :
                            path.join(process.env.GITHUB_WORKSPACE!, outFile);

        if (!fs.existsSync(configFilePath)) {
            throw new Error(`Config file does not exist: ${ configFile }`);
        }

        const environmentVariables = parseEnvironmentVariablesString(environmentVariablesString || '');

        const config: Record<string, string> = loadEnvFile(configFilePath, fileType);

        for (const key of Object.keys(config)) {
            if (key in environmentVariables) {
                config[key] = environmentVariables[key];
                core.info(`Set ${ key } to '${ environmentVariables[key] }'`);
            }
        }

        writeEnvFile(outFilePath, fileType, config)

        core.info(`Wrote updated values to ${ outFile }`);
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message);
        } else {
            core.setFailed(`Unknown error of type '${ typeof error }${ typeof error === 'object'
                                                                       ? ` / ${ error!.constructor.name }`
                                                                       : '' }' occurred:\n\n${ error }`);
        }
    }
}

function parseEnvironmentVariablesString(environmentVariablesString: string) {
    const items = getEnvironmentItems(environmentVariablesString);

    return items.reduce<Record<string, string>>((acc, { name, value }) => {
        if (acc[name]) {
            throw new Error(`The environment variable '${ name }' was specified multiple times in the action inputs`);
        }
        acc[name] = value;
        return acc;
    }, {});
}

function getEnvironmentItems(environmentVariablesString: string) {
    try {
        const env: { name: string, value: string, sensitive?: boolean }[] = JSON.parse(environmentVariablesString);
        for (const item of env) {
            if (item.sensitive) {
                core.setSecret(item.value);
            }
        }
        return env;
    } catch (e) {
        const items = environmentVariablesString.split('\n').map(x => x.trim()).filter(x => !!x.length)
                                                .map(x => x.split('='));
        const invalidLines = items.filter(x => x.length === 1);
        if (invalidLines.length) {
            throw new Error(`Invalid environment variables received. Input 'environment-variables' needs to be valid JSON or it needs to be lines of the form NAME=value. The following lines are invalid:\n${ invalidLines.join(
                '\n') }`);
        }

        return items.map(([ name, ...valueParts ]) => ({ name, value: valueParts.join('=') }));
    }
}

function loadEnvFile(path: string, fileType: string) {
    switch (fileType) {
        case 'json':
            return JSON.parse(fs.readFileSync(path, 'utf-8'));
        case 'env':
            return fs.readFileSync(path, 'utf-8').split('\n').reduce<Record<string, string>>((acc, curr) => {
                const parts = curr.split('=');
                acc[parts[0]] = parts.slice(1).join('=');
                return acc;
            }, {});
        default:
            throw new Error(`Unknown file type '${fileType}'`)
    }
}

function writeEnvFile(path: string, fileType: string, data: Record<string, string>) {
    switch (fileType) {
        case 'json':
            return fs.writeFileSync(path, JSON.stringify(data), 'utf-8');
        case 'env':
            return fs.writeFileSync(path,
                Object.entries(data).map(([ key, value ]) => `${ key }=${ value }`).join('\n'),
                'utf-8');
        default:
            throw new Error(`Unknown file type '${fileType}'`)
    }
}
