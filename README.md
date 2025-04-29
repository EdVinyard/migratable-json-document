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
   you create new instances or deserialize persisted instances)
2. you must keep old versions of your class/type in your codebase as long as a
   persisted version may still exist (e.g., class `WidgetV1` must remain even
   when you add class `WidgetV2`).

## Example

### Version 1

First, define the versioned type in `widget.ts` as follows.

<!-- #WidgetVersionOneDefinition-->
<!-- verifier:reset -->
<!-- verifier:include-node-module:migratable-json-document -->
<!-- verifier:prepend-as-file:widget.ts -->
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

<!-- #WidgetVersionOneUsage -->
```ts
import { Widget, toJSON, fromJSON } from './widget';

// serialize
const widgetA = new Widget({ shape: 'circle' });
const widgetAJson = toJSON(widgetA);


// deserialize
const widgetB = fromJSON(`{
    __migratable_type: "WidgetV1",
    __migratable_version: 1,
    shape: "circle",
}`);
```

Notice:

1. A `Symbol` denotes the type for serialization and deserialization.

## Version 2
