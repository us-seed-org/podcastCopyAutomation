import os
import sys
import re
import shutil

def apply_replacements():
    files_changed = []

    # 1. human-feedback.tsx
    try:
        with open('src/components/human-feedback.tsx', 'r') as f:
            text = f.read()
        new_text = re.sub(
            r'    useEffect\(\(\) => \{\n        if \(initialRating !== undefined\) setRating\(initialRating\);\n        if \(initialNotes !== undefined\) setNotes\(initialNotes\);\n        if \(initialRating \|\| initialNotes\) \{\n            setShowNotes\(true\);\n        \}\n        return \(\) => \{\n            isMounted\.current = false;\n        \};\n    \}, \[initialRating, initialNotes\]\);',
            r'''    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    useEffect(() => {
        if (initialRating !== undefined) setRating(initialRating);
        if (initialNotes !== undefined) setNotes(initialNotes);
        if (initialRating || initialNotes) {
            setShowNotes(true);
        }
    }, [initialRating, initialNotes]);''',
            text,
            flags=re.MULTILINE
        )
        if text != new_text:
            shutil.copy2('src/components/human-feedback.tsx', 'src/components/human-feedback.tsx.bak')
            with open('src/components/human-feedback.tsx', 'w') as f:
                f.write(new_text)
            files_changed.append('src/components/human-feedback.tsx')
    except Exception as e:
        print(f"Error processing src/components/human-feedback.tsx: {e}")

    # 2. pipeline-summary.tsx
    try:
        with open('src/components/pipeline-summary.tsx', 'r') as f:
            text = f.read()
        new_text = text.replace(
            '    AlertTriangle,\n} from "lucide-react";',
            '    AlertTriangle,\n    type LucideIcon,\n} from "lucide-react";'
        ).replace(
            '    icon: typeof Zap;',
            '    icon: LucideIcon;'
        )
        if text != new_text:
            shutil.copy2('src/components/pipeline-summary.tsx', 'src/components/pipeline-summary.tsx.bak')
            with open('src/components/pipeline-summary.tsx', 'w') as f:
                f.write(new_text)
            files_changed.append('src/components/pipeline-summary.tsx')
    except Exception as e:
        print(f"Error processing src/components/pipeline-summary.tsx: {e}")

    # 3. use-generation-pipeline.ts
    try:
        with open('src/hooks/use-generation-pipeline.ts', 'r') as f:
            text = f.read()
        new_text = text.replace(
            '      const entry = { ...action.entry, id: action.entry.id ?? crypto.randomUUID() };\n      return {\n        ...state,\n        traceEntries: [...state.traceEntries, entry],',
            '      return {\n        ...state,\n        traceEntries: [...state.traceEntries, action.entry],'
        )
        if text != new_text:
            shutil.copy2('src/hooks/use-generation-pipeline.ts', 'src/hooks/use-generation-pipeline.ts.bak')
            with open('src/hooks/use-generation-pipeline.ts', 'w') as f:
                f.write(new_text)
            files_changed.append('src/hooks/use-generation-pipeline.ts')
    except Exception as e:
        print(f"Error processing src/hooks/use-generation-pipeline.ts: {e}")

    # 4. pipeline-trace.spec.ts
    try:
        with open('tests/api/pipeline-trace.spec.ts', 'r') as f:
            text = f.read()
        new_text = text.replace(
            '            try {\n                events.push(JSON.parse(payload));\n            } catch {\n                // ignore\n            }\n        }\n        return events.filter(Boolean);',
            '            try {\n                events.push(JSON.parse(payload));\n            } catch (err) {\n                console.debug("Failed to parse SSE payload:", payload, err);\n            }\n        }\n        return events;'
        )
        if text != new_text:
            shutil.copy2('tests/api/pipeline-trace.spec.ts', 'tests/api/pipeline-trace.spec.ts.bak')
            with open('tests/api/pipeline-trace.spec.ts', 'w') as f:
                f.write(new_text)
            files_changed.append('tests/api/pipeline-trace.spec.ts')
    except Exception as e:
        print(f"Error processing tests/api/pipeline-trace.spec.ts: {e}")

    # 5. human-feedback.spec.ts
    try:
        with open('tests/ui/human-feedback.spec.ts', 'r') as f:
            text = f.read()
        new_text = re.sub(
            r'        const starCount = await stars\.count\(\);\n        if \(starCount < \d+\) \{\n            test\.fixme\(true, "Prerequisite: A completed generation with titleResultIds is required"\);\n            return;\n        \}',
            r'        const starCount = await stars.count();',
            text
        )
        if text != new_text:
            shutil.copy2('tests/ui/human-feedback.spec.ts', 'tests/ui/human-feedback.spec.ts.bak')
            with open('tests/ui/human-feedback.spec.ts', 'w') as f:
                f.write(new_text)
            files_changed.append('tests/ui/human-feedback.spec.ts')
    except Exception as e:
        print(f"Error processing tests/ui/human-feedback.spec.ts: {e}")

    print("Files changed:", files_changed)

def main():
    if len(sys.argv) > 1 and sys.argv[1] == '--apply':
        apply_replacements()
    else:
        print("Dry run mode. Use --apply to execute replacements.")

if __name__ == "__main__":
    main()
