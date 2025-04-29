# Migratable JSON Document

This is a port of a JSON document versioning system first developed by Ed
Vinyard for Python and MongoDB in 2012 to TypeScript.

## Use Case

1. You will store the serialized version of your class/type into, for example
   - a document in a document-oriented database, or
   - a JSON/text column of a relational database, or
   - a file on disk.
2. Over time, your classes/types will evolve (e.g., new fields will be added,
   old ones will be removed).
3. Rather than update all documents to match the current "shape" of your
   class/type, allow old serialized versions to remain in storage and "upgrade"
   them to the latest version lazily, when they are deserialized.
4. When you serialize your class/type instance, it will always be serialized as
   the latest version.

In practice, this means that

1. your application code only ever interacts with the latest version (e.g., when
   you create new instances or deserialize persisted instances),
2. you must keep old versions of your class/type in your codebase as long as a
   persisted version may still exist (e.g., class `WidgetV1` must remain even
   when you add class `WidgetV2`), and
3. this technique is most useful in your data access layer; the classes you'll
   write to be upgradable will not make good Domain entities.

## Example

See [src/migratable-json-document.test.ts](src/migratable-json-document.test.ts)
for an executable version of the following example code.

### Version 1

First, define the versioned type in `widget.ts` as follows.

```ts
import {
    versionedSerializable,
    deserialize,
    serialize,
} from 'migratable-json-document';

const WidgetTypeToken = Symbol.for('Widget');

export type Shape = 'circle' | 'triangle' | 'rectangle';

export interface FieldsOfV1 {
    readonly shape: Shape;
}

@versionedSerializable(WidgetTypeToken, 1)
class WidgetV1 implements FieldsOfV1 {
    readonly shape: Shape;

    constructor(state: FieldsOfV1) {
        this.shape = state.shape;
    }

    static defaultValue(): WidgetV1 {
        return new WidgetV1({ shape: 'triangle' });
    }

    toString(): string {
        return `<widget in the shape of a ${this.shape}>`;
    }
}

//--------------------------------------------------------------------------
export const Widget = WidgetV1;    // CHANGE THIS EVERY TIME A NEW VERSION IS CREATED
export type WidgetType = WidgetV1; // CHANGE THIS EVERY TIME A NEW VERSION IS CREATED

/**
 * Deserializer always produces the latest version of Widget, even when an
 * older serialized version is supplied.
 */
export const fromJSON = deserialize<WidgetType>(Widget.defaultValue);

/** Serializer always produces latest version of Widget */
export const toJSON = serialize<WidgetType>(Widget);
```

Now that you've configured your `Widget` for serialization, you can later use
`toJSON` and `fromJSON` to serialize and deserialize your `Widget` instances as
follows.

```ts
import { Widget, toJSON, fromJSON } from './widget';

// serialize
const widgetA = new Widget({ shape: 'triangle' });
const widgetAJson = toJSON(widgetA);
console.log(`serialized widgetA as ${widgetAJson}`);

// deserialize
const widgetBJson = `{
    "__migratable_type": "Widget",
    "__migratable_version": 1,
    "shape": "circle"
}`;
const widgetB = fromJSON(widgetBJson);
console.log(`\ndeserialized ${widgetB}`);
```

Notice:

1. A `Symbol` denotes the type for serialization and deserialization.

## Version 2

Later, you'll decide that it's time to update your _Widget_ to include new data,
so you'll write a new class, `WidgetV2`.

```ts
//--------------------------------------------------------------------------
// V2
//--------------------------------------------------------------------------
type Color = 'red' | 'blue' | 'green';

interface FieldsOfV2 extends FieldsOfV1 {
    readonly shape: Shape;
    readonly color: Color;
}

// NOTE: The advantage of using a separate version number as an argument to this
// registration decorator (rather than the class name) is that the class can be
// renamed at will without affecting the behavior of previously serialized data.
@versionedSerializable(WidgetTypeToken, 2)
class WidgetV2 implements FieldsOfV2 {
    readonly shape: Shape;
    readonly color: Color;                                     // New in v2!

    constructor(state: FieldsOfV2) {
        // for (const key in state) this[key] = state[key];
        this.shape = state.shape;
        this.color = state.color;
    }

    static defaultValue(): WidgetV2 {
        return new WidgetV2({
            shape: 'rectangle',
            color: 'blue',
        });
    }

    toString(): string {
        return `<widget in the shape of a ${this.shape} ` +
            `and colored ${this.color}>`;
    }

    // NOTE: upgrade() is not defined in most recent version
}

//--------------------------------------------------------------------------
// V1
//--------------------------------------------------------------------------
@versionedSerializable(WidgetTypeToken, 1)
class WidgetV1 implements FieldsOfV1, IUpgradeableTo<WidgetV2> {
    // ... same as in first version, but with the following new method ...

    upgrade(): WidgetV2 {
        return
    }
}

//--------------------------------------------------------------------------
const Widget = WidgetV2;     // CHANGE THIS EVERY TIME A NEW VERSION IS CREATED
type WidgetType = WidgetV2;  // CHANGE THIS EVERY TIME A NEW VERSION IS CREATED
```

Notice:

1. `WidgetV1` was neither deleted, nor changed in-place to add new data.
1. `WidgetV1` now implements `IUpgradeableTo<WidgetV2>` via its `upgrade()`
   method, which describes the upgrade from V1 to V2.
1. The `Widget` and `WidgetType` aliases now point at `WidgetV2`.
