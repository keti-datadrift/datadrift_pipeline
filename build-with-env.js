#!/usr/bin/env node

/**
 * Build script that automatically maps environment variables from parent .env file
 * to NEXT_PUBLIC_ prefixed variables for Next.js build
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`Environment file not found: ${filePath}`);
    return {};
  }

  const envContent = fs.readFileSync(filePath, 'utf8');
  const env = {};

  envContent.split('\n').forEach((line) => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        env[key.trim()] = valueParts.join('=').trim();
      }
    }
  });

  return env;
}

function resolveVariables(env) {
  const resolved = { ...env };
  let changed = true;

  // Resolve variable substitutions like ${HOSTNAME}
  while (changed) {
    changed = false;
    for (const [key, value] of Object.entries(resolved)) {
      if (typeof value === 'string' && value.includes('${')) {
        const newValue = value.replace(/\$\{([^}]+)\}/g, (match, varName) => {
          return resolved[varName] || match;
        });
        if (newValue !== value) {
          resolved[key] = newValue;
          changed = true;
        }
      }
    }
  }

  return resolved;
}

function main() {
  console.log(
    '🔧 Building Next.js with environment variables from parent .env file...',
  );

  // Load parent .env file
  const parentEnvPath = path.join(__dirname, '..', '.env');
  const env = loadEnvFile(parentEnvPath);
  const resolvedEnv = resolveVariables(env);

  // Map to NEXT_PUBLIC_ variables
  const nextPublicEnv = {
    NEXT_PUBLIC_HOST: `http://${resolvedEnv.HOSTNAME}:81/`,
    NEXT_PUBLIC_LABELSTUDIO_URL: resolvedEnv.LABEL_STUDIO_URL,
    NEXT_PUBLIC_CORE_DEMO_URL: resolvedEnv.CORE_DEMO_URL,
  };

  console.log('📋 Environment variables mapped:');
  Object.entries(nextPublicEnv).forEach(([key, value]) => {
    console.log(`  ${key}=${value}`);
  });

  // Set environment variables for the build process
  Object.entries(nextPublicEnv).forEach(([key, value]) => {
    process.env[key] = value;
  });

  // Run the build
  console.log('🚀 Running Next.js build...');
  try {
    execSync('bun run build', {
      stdio: 'inherit',
      env: { ...process.env, ...nextPublicEnv },
    });
    console.log('✅ Build completed successfully!');
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { loadEnvFile, resolveVariables };
