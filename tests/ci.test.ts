import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';

describe('GitHub Actions CI pipeline', () => {
  const ciPath = join(process.cwd(), '.github', 'workflows', 'ci.yml');
  let workflow: any;

  beforeAll(() => {
    const content = readFileSync(ciPath, 'utf-8');
    workflow = parseYaml(content);
  });

  describe('Workflow file structure', () => {
    it('should exist at .github/workflows/ci.yml', () => {
      expect(existsSync(ciPath)).toBe(true);
    });

    it('should be valid YAML', () => {
      expect(workflow).toBeDefined();
      expect(typeof workflow).toBe('object');
    });

    it('should have name property', () => {
      expect(workflow).toHaveProperty('name');
      expect(workflow.name).toBe('CI');
    });
  });

  describe('Workflow triggers', () => {
    it('should trigger on push to main branch', () => {
      expect(workflow).toHaveProperty('on');
      expect(workflow.on).toHaveProperty('push');
      expect(workflow.on.push).toHaveProperty('branches');
      expect(workflow.on.push.branches).toContain('main');
    });

    it('should trigger on pull requests to main branch', () => {
      expect(workflow.on).toHaveProperty('pull_request');
      expect(workflow.on.pull_request).toHaveProperty('branches');
      expect(workflow.on.pull_request.branches).toContain('main');
    });
  });

  describe('Required jobs', () => {
    it('should define all required jobs', () => {
      expect(workflow).toHaveProperty('jobs');
      expect(workflow.jobs).toHaveProperty('lint');
      expect(workflow.jobs).toHaveProperty('test-unit');
      expect(workflow.jobs).toHaveProperty('test-integration');
      expect(workflow.jobs).toHaveProperty('test-e2e');
      expect(workflow.jobs).toHaveProperty('build');
    });

    it('should have all jobs configured to run in parallel', () => {
      const jobs = workflow.jobs;
      
      // Jobs run in parallel by default unless needs: is specified
      // Verify no job has dependencies on others
      expect(jobs.lint.needs).toBeUndefined();
      expect(jobs['test-unit'].needs).toBeUndefined();
      expect(jobs['test-integration'].needs).toBeUndefined();
      expect(jobs['test-e2e'].needs).toBeUndefined();
      expect(jobs.build.needs).toBeUndefined();
    });
  });

  describe('Lint job', () => {
    it('should run on ubuntu-latest', () => {
      expect(workflow.jobs.lint['runs-on']).toBe('ubuntu-latest');
    });

    it('should checkout code', () => {
      const steps = workflow.jobs.lint.steps;
      const checkoutStep = steps.find((s: any) => s.uses?.includes('checkout'));
      expect(checkoutStep).toBeDefined();
    });

    it('should setup Node.js 20', () => {
      const steps = workflow.jobs.lint.steps;
      const nodeStep = steps.find((s: any) => s.uses?.includes('setup-node'));
      expect(nodeStep).toBeDefined();
      expect(nodeStep.with['node-version']).toBe('20');
    });

    it('should install dependencies', () => {
      const steps = workflow.jobs.lint.steps;
      const installStep = steps.find((s: any) => 
        s.name?.includes('Install') || s.run?.includes('pnpm install')
      );
      expect(installStep).toBeDefined();
    });

    it('should run lint command', () => {
      const steps = workflow.jobs.lint.steps;
      const lintStep = steps.find((s: any) => s.run?.includes('pnpm run lint'));
      expect(lintStep).toBeDefined();
    });

    it('should check formatting', () => {
      const steps = workflow.jobs.lint.steps;
      const formatStep = steps.find((s: any) => 
        s.run?.includes('format') && s.run?.includes('check')
      );
      expect(formatStep).toBeDefined();
    });
  });

  describe('Test-unit job', () => {
    it('should run on ubuntu-latest', () => {
      expect(workflow.jobs['test-unit']['runs-on']).toBe('ubuntu-latest');
    });

    it('should setup Node.js and install dependencies', () => {
      const steps = workflow.jobs['test-unit'].steps;
      const nodeStep = steps.find((s: any) => s.uses?.includes('setup-node'));
      const installStep = steps.find((s: any) => s.run?.includes('pnpm install'));
      
      expect(nodeStep).toBeDefined();
      expect(installStep).toBeDefined();
    });

    it('should run unit tests', () => {
      const steps = workflow.jobs['test-unit'].steps;
      const testStep = steps.find((s: any) => s.run?.includes('pnpm run test'));
      expect(testStep).toBeDefined();
    });
  });

  describe('Test-integration job', () => {
    it('should run on ubuntu-latest', () => {
      expect(workflow.jobs['test-integration']['runs-on']).toBe('ubuntu-latest');
    });

    it('should not use local Redis service container', () => {
      const job = workflow.jobs['test-integration'];
      // Upstash Redis is used instead of local container
      expect(job.services).toBeUndefined();
    });

    it('should use Upstash Redis URL from secrets', () => {
      const steps = workflow.jobs['test-integration'].steps;
      const testStep = steps.find((s: any) => s.run?.includes('pnpm run test'));
      
      expect(testStep).toBeDefined();
      expect(testStep.env).toBeDefined();
      expect(testStep.env.REDIS_URL).toMatch(/\$\{\{\s*secrets\.UPSTASH_REDIS_URL\s*\}\}/);
    });

    it('should run integration tests with Redis environment', () => {
      const steps = workflow.jobs['test-integration'].steps;
      const testStep = steps.find((s: any) => s.run?.includes('pnpm run test'));
      
      expect(testStep).toBeDefined();
      expect(testStep.env).toBeDefined();
      expect(testStep.env.REDIS_URL).toBeDefined();
    });
  });

  describe('Test-e2e job', () => {
    it('should run on ubuntu-latest', () => {
      expect(workflow.jobs['test-e2e']['runs-on']).toBe('ubuntu-latest');
    });

    it('should install Playwright browsers', () => {
      const steps = workflow.jobs['test-e2e'].steps;
      const playwrightStep = steps.find((s: any) => 
        s.run?.includes('playwright install')
      );
      expect(playwrightStep).toBeDefined();
      expect(playwrightStep.run).toContain('--with-deps');
    });

    it('should run e2e tests', () => {
      const steps = workflow.jobs['test-e2e'].steps;
      const testStep = steps.find((s: any) => s.run?.includes('pnpm run test:e2e'));
      expect(testStep).toBeDefined();
    });

    it('should upload test results on failure', () => {
      const steps = workflow.jobs['test-e2e'].steps;
      const uploadStep = steps.find((s: any) => 
        s.uses?.includes('upload-artifact') && s.if === 'failure()'
      );
      expect(uploadStep).toBeDefined();
    });
  });

  describe('Build job', () => {
    it('should run on ubuntu-latest', () => {
      expect(workflow.jobs.build['runs-on']).toBe('ubuntu-latest');
    });

    it('should setup Node.js and install dependencies', () => {
      const steps = workflow.jobs.build.steps;
      const nodeStep = steps.find((s: any) => s.uses?.includes('setup-node'));
      const installStep = steps.find((s: any) => s.run?.includes('pnpm install'));
      
      expect(nodeStep).toBeDefined();
      expect(installStep).toBeDefined();
    });

    it('should run build command', () => {
      const steps = workflow.jobs.build.steps;
      const buildStep = steps.find((s: any) => s.run?.includes('pnpm run build'));
      expect(buildStep).toBeDefined();
    });

    it('should run devvit validate', () => {
      const steps = workflow.jobs.build.steps;
      const validateStep = steps.find((s: any) => 
        s.run?.includes('pnpm run validate')
      );
      expect(validateStep).toBeDefined();
    });

    it('should upload build artifacts', () => {
      const steps = workflow.jobs.build.steps;
      const uploadStep = steps.find((s: any) => 
        s.uses?.includes('upload-artifact') && s.with?.name === 'build-output'
      );
      expect(uploadStep).toBeDefined();
      expect(uploadStep.with.path).toBe('dist/');
    });
  });

  describe('Job run conditions', () => {
    it('should have all jobs run unconditionally by default', () => {
      const jobs = workflow.jobs;
      
      // Check that no job has restrictive if conditions
      Object.keys(jobs).forEach(jobName => {
        const job = jobs[jobName];
        // Jobs without 'if' run unconditionally, which is what we want
        if (job.if) {
          // If there is an 'if', it should not prevent normal execution
          expect(job.if).not.toContain('failure()');
        }
      });
    });
  });

  describe('Node.js version consistency', () => {
    it('should use Node.js 20 across all jobs', () => {
      const jobs = workflow.jobs;
      
      Object.keys(jobs).forEach(jobName => {
        const job = jobs[jobName];
        const nodeStep = job.steps?.find((s: any) => s.uses?.includes('setup-node'));
        
        if (nodeStep) {
          expect(nodeStep.with['node-version']).toBe('20');
        }
      });
    });
  });

  describe('Caching configuration', () => {
    it('should enable pnpm caching in all jobs', () => {
      const jobs = workflow.jobs;
      
      Object.keys(jobs).forEach(jobName => {
        const job = jobs[jobName];
        const nodeStep = job.steps?.find((s: any) => s.uses?.includes('setup-node'));
        
        if (nodeStep) {
          expect(nodeStep.with.cache).toBe('pnpm');
        }
      });
    });
  });
});
