import { Input, Output, ComponentResource, ComponentResourceOptions } from "@pulumi/pulumi";

export interface NetworkArgs {
    vpcCidrBlock: Input<string>;
    publicSubnetCidrBlocks: Input<string>[];
    tags?: {};
};

export interface WebServerArgs {
    networkId: Input<string>;
    subnetId: Input<string>;
    tags?: {};
}

export abstract class Network extends ComponentResource {
    abstract getNetworkId(): Output<string>;
    abstract getPublicSubnetIds(): Output<string>[];

    constructor(componentName: string, name: string, args: NetworkArgs, opts?: ComponentResourceOptions) {
        super(componentName, name, args, opts);
    };
}

export abstract class WebServer extends ComponentResource {
    abstract getInstanceId(): Output<string>;
    abstract getInstanceAddress(): Output<string>;

    constructor(componentName: string, name: string, args: WebServerArgs, opts?: ComponentResourceOptions) {
        super(componentName, name, args, opts);
    };
}
